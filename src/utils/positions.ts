import { ProductItem } from '../types';

/** A photo cell of a position: -1 = the original, 0.. = variant / angle columns. */
export interface SlotRef {
  id: string;
  slot: number;
}

export const SLOT_DRAG_TYPE = 'application/x-aips-slot';
export const NO_GROUP = 'Без группы';

export function slotGet(p: ProductItem, slot: number): string {
  return slot < 0 ? p.photoDataUrl : p.variants?.[slot] || '';
}

/** What a cell shows: «общее», «бок», «деталь», «в действии»… Each product has its own set. */
export const ANGLE_PRESETS = ['общее', 'бок', 'сзади', 'сверху', 'деталь', 'деталь 2', 'деталь 3', 'в действии', 'в руке', 'упаковка'];

export function angleOf(p: ProductItem, slot: number): string {
  return p.angles?.[String(slot)] || '';
}

export function setAngle(p: ProductItem, slot: number, angle: string): ProductItem {
  const angles = { ...(p.angles || {}) };
  if (angle) angles[String(slot)] = angle;
  else delete angles[String(slot)];
  return { ...p, angles };
}

export function slotSet(p: ProductItem, slot: number, src: string): ProductItem {
  if (slot < 0) return { ...p, photoDataUrl: src };
  const variants = [...(p.variants || [])];
  while (variants.length <= slot) variants.push(null);
  variants[slot] = src || null;
  return { ...p, variants: trimVariants(variants) };
}

function trimVariants(v: (string | null)[]): (string | null)[] {
  const out = [...v];
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

/** Move a photo to another cell (same or other position). If the target is taken, the two swap. */
export function movePhoto(list: ProductItem[], from: SlotRef, to: SlotRef): ProductItem[] {
  if (from.id === to.id && from.slot === to.slot) return list;
  const src = list.find((p) => p.id === from.id);
  const dst = list.find((p) => p.id === to.id);
  if (!src || !dst) return list;
  const moving = slotGet(src, from.slot);
  if (!moving) return list;
  const displaced = slotGet(dst, to.slot);
  // the «ракурс» label travels with its photo
  const movingAngle = angleOf(src, from.slot);
  const displacedAngle = angleOf(dst, to.slot);
  return list.map((p) => {
    let next = p;
    if (p.id === from.id) next = setAngle(slotSet(next, from.slot, displaced), from.slot, displaced ? displacedAngle : '');
    if (p.id === to.id) next = setAngle(slotSet(next, to.slot, moving), to.slot, movingAngle);
    // The ★ follows the photo inside one row; across rows it is cleared where it pointed at a moved cell
    if (p.id === from.id && p.id === to.id && (p.finalIndex ?? -1) === from.slot) next = { ...next, finalIndex: to.slot };
    else if (p.id === from.id && (p.finalIndex ?? -1) === from.slot && from.id !== to.id) next = { ...next, finalIndex: undefined };
    return next;
  });
}

/** All photos of a position, original first. */
function photosOf(p: ProductItem): string[] {
  return [p.photoDataUrl, ...(p.variants || [])].filter((x): x is string => Boolean(x));
}

/**
 * Merge positions into one: their photos become more angles of the target
 * (the original cell is used first if it is empty), and the merged rows disappear.
 */
export function mergeInto(list: ProductItem[], sourceIds: string[], targetId: string): ProductItem[] {
  const sources = sourceIds.filter((id) => id !== targetId);
  if (sources.length === 0) return list;
  const target = list.find((p) => p.id === targetId);
  if (!target) return list;
  let merged: ProductItem = { ...target, variants: [...(target.variants || [])] };
  for (const id of sources) {
    const p = list.find((x) => x.id === id);
    if (!p) continue;
    for (const photo of photosOf(p)) {
      if (!merged.photoDataUrl) {
        merged = { ...merged, photoDataUrl: photo };
        continue;
      }
      const variants = [...(merged.variants || [])];
      const free = variants.findIndex((v) => !v);
      if (free >= 0) variants[free] = photo;
      else variants.push(photo);
      merged = { ...merged, variants };
    }
  }
  return list.filter((p) => !sources.includes(p.id)).map((p) => (p.id === targetId ? merged : p));
}

export function setCategory(list: ProductItem[], ids: string[], category: string): ProductItem[] {
  const c = category.trim();
  return list.map((p) => (ids.includes(p.id) ? { ...p, category: c && c !== NO_GROUP ? c : undefined } : p));
}

export function renameCategory(list: ProductItem[], from: string, to: string): ProductItem[] {
  const t = to.trim();
  return list.map((p) => ((p.category || NO_GROUP) === from ? { ...p, category: t && t !== NO_GROUP ? t : undefined } : p));
}

/** Rows grouped by category, in order of first appearance; rows without a category last. */
export function groupByCategory(list: ProductItem[]): { title: string; rows: { p: ProductItem; index: number }[] }[] {
  const order: string[] = [];
  const map = new Map<string, { p: ProductItem; index: number }[]>();
  list.forEach((p, index) => {
    const key = p.category || NO_GROUP;
    if (!map.has(key)) {
      map.set(key, []);
      if (key !== NO_GROUP) order.push(key);
    }
    map.get(key)!.push({ p, index });
  });
  if (map.has(NO_GROUP)) order.push(NO_GROUP);
  return order.map((title) => ({ title, rows: map.get(title)! }));
}
