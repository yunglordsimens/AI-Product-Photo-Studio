/**
 * A folder of photos → positions.
 *
 * Two kinds of folders are told apart by the file names:
 * - names are the products ("Salmon Bowl.jpg" inside "Poke Bowls"): one position per file, the folder is its group;
 * - names are just numbers ("01.jpg", "IMG_2041.jpg") inside "785756834 - Стабілізатор …": the folder is ONE product,
 *   its first photo is the original and the rest go to the next columns (angles).
 */
import { ProductItem } from '../types';
import { FolderFile, groupByFolder } from './folderImport';
import { normalizeImageFiles } from './heic';
import { compressImageDataUrl } from './storage';

const GENERIC = /^(?:\d+[a-z]?|[\d\s_.-]+|(?:img|dsc|dscn|dscf|pxl|photo|foto|image|picture|pic|screenshot|снимок|фото|kopie|copy)[\s_.()-]*\d[\d\s_.()-]*.*)$/i;

/** «01», «IMG_2041», «photo 3» — a name that says nothing about the product */
export function isGenericName(fileName: string): boolean {
  return GENERIC.test(fileName.replace(/\.[^.]+$/, '').trim());
}

/** «785756834 - Стабілізатор …» → { sku: '785756834', name: 'Стабілізатор …' } */
export function splitSku(folderName: string): { sku?: string; name: string } {
  const m = folderName.match(/^\s*(\d{4,})\s*[-–—_.]\s*(.+)$/);
  return m ? { sku: m[1], name: m[2].trim() } : { name: folderName.trim() };
}

export const normName = (s: string) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

async function readPhoto(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => resolve('');
    r.readAsDataURL(file);
  });
  return raw ? compressImageDataUrl(raw, 1200, 0.85) : '';
}

export interface FolderImportResult {
  next: ProductItem[];
  added: number;
  filled: number;
  /** How many positions were made from a folder of several photos (angles) */
  folderProducts: number;
  /** Most photos one position got: tells how many variant columns to show */
  maxPhotos: number;
}

export async function importFolderToPositions(
  files: FolderFile[],
  existing: ProductItem[],
  onProgress?: (done: number, total: number, label: string) => void
): Promise<FolderImportResult> {
  const groups = groupByFolder(files);
  const single = groups.length === 1;
  const next = [...existing];
  let added = 0;
  let filled = 0;
  let folderProducts = 0;
  let maxPhotos = 1;
  let done = 0;
  const total = files.length;
  const newId = (n: number) => `prod_${Date.now()}_${n}_${Math.random().toString(36).slice(2, 6)}`;

  for (const g of groups) {
    const generic = g.files.filter((f) => isGenericName(f.file.name)).length;
    const folderIsProduct = generic / g.files.length >= 0.6;
    const images = await normalizeImageFiles(g.files.map((f) => f.file));

    if (folderIsProduct) {
      // Name = the folder itself; anything above it is the group
      const parts = g.name.split(' / ');
      const { sku, name } = splitSku(parts[parts.length - 1]);
      const category = parts.length > 1 ? parts.slice(0, -1).join(' / ') : undefined;
      const photos: string[] = [];
      for (const img of images) {
        onProgress?.(++done, total, name);
        const photo = await readPhoto(img);
        if (photo) photos.push(photo);
      }
      if (photos.length === 0) continue;
      maxPhotos = Math.max(maxPhotos, photos.length);
      const idx = next.findIndex((p) => (sku && p.sku === sku) || normName(p.name) === normName(name));
      if (idx >= 0) {
        const p = next[idx];
        next[idx] = { ...p, photoDataUrl: photos[0], variants: photos.slice(1), sku: p.sku || sku, category: p.category || category };
        filled++;
      } else {
        next.push({ id: newId(done), name, sku, category, photoDataUrl: photos[0], variants: photos.slice(1) });
        added++;
      }
      folderProducts++;
      continue;
    }

    // Each file is a product, the folder is its group
    for (const img of images) {
      const fileBase = img.name.replace(/\.[^.]+$/, '');
      onProgress?.(++done, total, g.name);
      const photo = await readPhoto(img);
      if (!photo) continue;
      const { sku, name } = splitSku(fileBase);
      const category = single ? undefined : g.name;
      const idx = next.findIndex((p) => (sku && p.sku === sku) || normName(p.name) === normName(name));
      if (idx >= 0) {
        next[idx] = { ...next[idx], photoDataUrl: photo, sku: next[idx].sku || sku, category: next[idx].category || category };
        filled++;
      } else {
        next.push({ id: newId(done), name, sku, category, photoDataUrl: photo });
        added++;
      }
    }
  }
  return { next, added, filled, folderProducts, maxPhotos };
}

/** A short line about what happened */
export function folderImportNote(r: FolderImportResult): string {
  const parts = [`новых позиций ${r.added}`];
  if (r.filled) parts.push(`обновлено ${r.filled}`);
  if (r.folderProducts) parts.push(`из них по папке на товар: ${r.folderProducts} (первое фото — исходник, остальные — ракурсы в колонках)`);
  return `Готово: ${parts.join(', ')}.`;
}

/** Show at least `n` variant columns in the positions table (max 8) */
export function ensureVariantCols(n: number) {
  try {
    const cur = Number(localStorage.getItem('aips_variant_cols') || '2');
    const want = Math.min(8, Math.max(cur, n));
    if (want === cur) return;
    localStorage.setItem('aips_variant_cols', String(want));
    window.dispatchEvent(new CustomEvent('aips-variant-cols', { detail: want }));
  } catch {
    /* private mode */
  }
}
