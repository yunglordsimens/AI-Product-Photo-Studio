import { ProductItem } from '../types';
import { buildZip, dataUrlToBytes, downloadBlob, ZipEntry } from './zip';
import { slugify } from './catalog';

export type ExportPreset = 'names' | 'shopify' | 'woocommerce';
export type ExportPhotos = 'final' | 'all' | 'source';

export const EXPORT_PRESETS: { id: ExportPreset; label: string; note: string }[] = [
  {
    id: 'names',
    label: 'Фото по названиям',
    note: 'Файл = точное название позиции. Для замены фото по имени (ChoiceQR, своё меню, сайт).',
  },
  {
    id: 'shopify',
    label: 'Shopify',
    note: 'products.csv для импорта товаров. Фото в Shopify подтягиваются по ссылкам: укажи адрес, куда зальёшь папку фото.',
  },
  {
    id: 'woocommerce',
    label: 'WooCommerce',
    note: 'products.csv для импорта в WordPress / WooCommerce. Фото тоже по ссылкам.',
  },
];

/** The photo that counts as the result for a position: the one marked ★, else the original. */
export function finalPhoto(p: ProductItem): string {
  const i = p.finalIndex ?? -1;
  if (i >= 0 && p.variants?.[i]) return p.variants[i] as string;
  return p.photoDataUrl;
}

/** Keeps the name readable (diacritics, spaces) but safe as a file name everywhere. */
function fileSafe(name: string): string {
  return (name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'item').slice(0, 120);
}

function csv(rows: (string | number)[][]): Uint8Array {
  const cell = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel and Numbers open Czech / Vietnamese names correctly
  return new TextEncoder().encode('﻿' + rows.map((r) => r.map(cell).join(',')).join('\n') + '\n');
}

function joinUrl(base: string, file: string): string {
  if (!base.trim()) return '';
  return base.trim().replace(/\/+$/, '') + '/' + encodeURIComponent(file);
}

export function exportPositions(
  products: ProductItem[],
  opts: { preset: ExportPreset; photos: ExportPhotos; baseUrl: string; projectName: string }
): { files: number; missing: string[] } {
  const entries: ZipEntry[] = [];
  const missing: string[] = [];
  const used = new Set<string>();
  const uniqueName = (base: string, ext: string) => {
    let name = `${base}.${ext}`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}.${ext}`;
    used.add(name.toLowerCase());
    return name;
  };

  // Every position gets a list of image files (one, or several with "all variants")
  const rows = products.map((p) => {
    const base = opts.preset === 'names' ? fileSafe(p.name) : slugify(p.name);
    const sources =
      opts.photos === 'source'
        ? [p.photoDataUrl]
        : opts.photos === 'final'
          ? [finalPhoto(p)]
          : [p.photoDataUrl, ...(p.variants || [])];
    const files: string[] = [];
    sources.filter(Boolean).forEach((src, i) => {
      try {
        const { bytes, ext } = dataUrlToBytes(src as string);
        const name = uniqueName(i === 0 ? base : `${base} ${i + 1}`, ext);
        entries.push({ name: `photos/${name}`, data: bytes });
        files.push(name);
      } catch {
        // not a data URL: skip
      }
    });
    if (files.length === 0) missing.push(p.name);
    return { p, handle: slugify(p.name), files };
  });

  if (opts.preset === 'names') {
    entries.push({
      name: 'positions.csv',
      data: csv([['Название', 'Категория', 'Файл'], ...rows.map((r) => [r.p.name, r.p.category || '', r.files.join(' | ')])]),
    });
  } else if (opts.preset === 'shopify') {
    const header = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Status', 'Image Src', 'Image Position', 'Image Alt Text'];
    const lines: (string | number)[][] = [header];
    rows.forEach((r) => {
      const imgs = r.files.length ? r.files : [''];
      imgs.forEach((f, i) => {
        lines.push(
          i === 0
            ? [r.handle, r.p.name, '', opts.projectName, r.p.category || '', r.p.category || '', 'TRUE', 'draft', joinUrl(opts.baseUrl, f), f ? 1 : '', r.p.name]
            : [r.handle, '', '', '', '', '', '', '', joinUrl(opts.baseUrl, f), i + 1, r.p.name]
        );
      });
    });
    entries.push({ name: 'products.csv', data: csv(lines) });
  } else {
    const header = ['Type', 'SKU', 'Name', 'Published', 'Categories', 'Images'];
    entries.push({
      name: 'products.csv',
      data: csv([
        header,
        ...rows.map((r) => ['simple', r.handle, r.p.name, 1, r.p.category || '', r.files.map((f) => joinUrl(opts.baseUrl, f)).filter(Boolean).join(', ')]),
      ]),
    });
  }

  const preset = EXPORT_PRESETS.find((x) => x.id === opts.preset);
  const readme = [
    `${opts.projectName}. Позиций: ${products.length}, фото: ${entries.filter((e) => e.name.startsWith('photos/')).length}.`,
    preset ? `Формат: ${preset.label}. ${preset.note}` : '',
    opts.preset !== 'names' && !opts.baseUrl.trim()
      ? 'Ссылки на фото пустые: залей папку photos на хостинг (или в Shopify Files) и экспортируй ещё раз, указав её адрес.'
      : '',
    missing.length ? `Без фото: ${missing.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  entries.push({ name: 'README.txt', data: new TextEncoder().encode(readme + '\n') });

  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(buildZip(entries), `${slugify(opts.projectName)}-${opts.preset}-${stamp}.zip`);
  return { files: entries.length, missing };
}
