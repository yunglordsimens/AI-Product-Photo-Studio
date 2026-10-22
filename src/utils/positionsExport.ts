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

export interface ExportSize {
  id: string;
  label: string;
  w: number;
  h: number;
}

/** Common sizes. Delivery apps change their specs often, so check theirs before uploading. */
export const EXPORT_SIZES: ExportSize[] = [
  { id: 'sq', label: '1:1 · 1200', w: 1200, h: 1200 },
  { id: 'sq2048', label: '1:1 · 2048', w: 2048, h: 2048 },
  { id: 'post', label: '4:5 · 1080×1350', w: 1080, h: 1350 },
  { id: 'story', label: '9:16 · 1080×1920', w: 1080, h: 1920 },
  { id: 'land', label: '3:2 · 1200×800', w: 1200, h: 800 },
  { id: 'wide', label: '16:9 · 1920×1080', w: 1920, h: 1080 },
];

export type FitMode = 'cover' | 'contain';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('bad image'));
    img.src = src;
  });
}

/** One photo at an exact size: cropped to the centre, or fitted whole on a background */
export async function resizeTo(src: string, w: number, h: number, mode: FitMode, bg = '#ffffff'): Promise<Uint8Array> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (mode === 'cover') {
    const s = Math.max(w / iw, h / ih);
    const sw = w / s;
    const sh = h / s;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
  } else {
    const s = Math.min(w / iw, h / ih);
    const dw = iw * s;
    const dh = ih * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('resize failed'))), 'image/jpeg', 0.92)
  );
  return new Uint8Array(await blob.arrayBuffer());
}

/** The photo that counts as the result for a position: the one marked ★, else the original. */
export function finalPhoto(p: ProductItem): string {
  const i = p.finalIndex ?? -1;
  if (i >= 0 && p.variants?.[i]) return p.variants[i] as string;
  return p.photoDataUrl;
}

/** Keeps the name readable (diacritics, spaces) but safe as a file name everywhere. */
export function fileSafe(name: string): string {
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

export async function exportPositions(
  products: ProductItem[],
  opts: {
    preset: ExportPreset;
    photos: ExportPhotos;
    baseUrl: string;
    projectName: string;
    /** Extra sized copies; each size gets its own folder. Empty = only the photos as they are. */
    sizes?: ExportSize[];
    /** Keep the photos as they are too (photos/) */
    keepOriginal?: boolean;
    fit?: FitMode;
    bg?: string;
  }
): Promise<{ files: number; missing: string[] }> {
  const entries: ZipEntry[] = [];
  const missing: string[] = [];
  const sizes = opts.sizes || [];
  const keepOriginal = opts.keepOriginal !== false || sizes.length === 0;
  const sizeFolder = (sz: ExportSize) => `${sz.w}x${sz.h}`;
  const used = new Set<string>();
  // Unique by base name, so the same photo has the same name in every size folder
  const uniqueBase = (base: string) => {
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    used.add(name.toLowerCase());
    return name;
  };
  const allSources: { src: string; base: string }[] = [];

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
        const b = uniqueBase(i === 0 ? base : `${base} ${i + 1}`);
        if (keepOriginal) {
          entries.push({ name: `photos/${b}.${ext}`, data: bytes });
          files.push(`${b}.${ext}`);
        } else {
          files.push(`${b}.jpg`);
        }
        allSources.push({ src: src as string, base: b });
      } catch {
        // not a data URL: skip
      }
    });
    if (files.length === 0) missing.push(p.name);
    return { p, handle: slugify(p.name), files };
  });

  // Sized copies: one folder per size, same file names
  for (const sz of sizes) {
    for (const x of allSources) {
      try {
        const data = await resizeTo(x.src, sz.w, sz.h, opts.fit || 'cover', opts.bg);
        entries.push({ name: `${sizeFolder(sz)}/${x.base}.jpg`, data });
      } catch {
        // unreadable photo: skip in this size
      }
    }
  }

  if (opts.preset === 'names') {
    entries.push({
      name: 'positions.csv',
      data: csv([['Название', 'Категория', 'Код', 'Цена', 'Файл'], ...rows.map((r) => [r.p.name, r.p.category || '', r.p.sku || '', r.p.price || '', r.files.join(' | ')])]),
    });
  } else if (opts.preset === 'shopify') {
    const header = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Status', 'Variant SKU', 'Variant Price', 'Image Src', 'Image Position', 'Image Alt Text'];
    const lines: (string | number)[][] = [header];
    rows.forEach((r) => {
      const imgs = r.files.length ? r.files : [''];
      imgs.forEach((f, i) => {
        lines.push(
          i === 0
            ? [r.handle, r.p.name, '', opts.projectName, r.p.category || '', r.p.category || '', 'TRUE', 'draft', r.p.sku || '', r.p.price || '', joinUrl(opts.baseUrl, f), f ? 1 : '', r.p.name]
            : [r.handle, '', '', '', '', '', '', '', '', '', joinUrl(opts.baseUrl, f), i + 1, r.p.name]
        );
      });
    });
    entries.push({ name: 'products.csv', data: csv(lines) });
  } else {
    const header = ['Type', 'SKU', 'Name', 'Published', 'Regular price', 'Categories', 'Images'];
    entries.push({
      name: 'products.csv',
      data: csv([
        header,
        ...rows.map((r) => ['simple', r.p.sku || r.handle, r.p.name, 1, r.p.price || '', r.p.category || '', r.files.map((f) => joinUrl(opts.baseUrl, f)).filter(Boolean).join(', ')]),
      ]),
    });
  }

  const preset = EXPORT_PRESETS.find((x) => x.id === opts.preset);
  const readme = [
    `${opts.projectName}. Позиций: ${products.length}, фото: ${allSources.length}${sizes.length ? ` × ${sizes.length + (keepOriginal ? 1 : 0)} размеров` : ''}.`,
    preset ? `Формат: ${preset.label}. ${preset.note}` : '',
    opts.preset !== 'names' && !opts.baseUrl.trim()
      ? 'Ссылки на фото пустые: залей папку photos на хостинг (или в Shopify Files) и экспортируй ещё раз, указав её адрес.'
      : '',
    sizes.length
      ? `Размеры: ${sizes.map((sz) => `${sizeFolder(sz)}/`).join(', ')} — ${opts.fit === 'contain' ? 'фото целиком, вписано на фон' : 'обрезано по центру'}. Имена файлов в каждой папке одинаковые. Требования площадок (Wolt, Bolt Food, Foodora и др.) меняются: проверь их перед загрузкой.`
      : '',
    sizes.length && !keepOriginal ? 'В CSV — имена файлов из папок размеров.' : '',
    missing.length ? `Без фото: ${missing.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  entries.push({ name: 'README.txt', data: new TextEncoder().encode(readme + '\n') });

  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(buildZip(entries), `${slugify(opts.projectName)}-${opts.preset}-${stamp}.zip`);
  return { files: entries.length, missing };
}
