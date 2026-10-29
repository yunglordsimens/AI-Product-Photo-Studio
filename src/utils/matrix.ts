/**
 * «Оси»: geometry of the board grid. Cards belong to a cell by their centre; nothing else is stored,
 * so moving a photo out of the grid simply takes it out.
 */
import { BoardMatrix, Card, ProductItem } from '../types';

export const MATRIX_LABEL_W = 180;
export const MATRIX_LABEL_H = 28;
const PAD = 10;

export function newMatrix(x: number, y: number, rows = 3, cols = 3): BoardMatrix {
  return {
    id: `matrix_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: 'Оси',
    x,
    y,
    cellW: 240,
    cellH: 280,
    rows: Array.from({ length: rows }, (_, i) => `Товар ${i + 1}`),
    cols: Array.from({ length: cols }, (_, i) => `Ракурс ${i + 1}`),
    productsAlong: 'rows',
  };
}

export const matrixWidth = (m: BoardMatrix) => m.cols.length * m.cellW;
export const matrixHeight = (m: BoardMatrix) => m.rows.length * m.cellH;

const centre = (c: Card) => ({ x: c.x + c.width / 2, y: c.y + (c.height || c.width) / 2 });

/** Cell under the card's centre, or null when it is outside the grid */
export function cellOf(m: BoardMatrix, card: Card): { r: number; c: number } | null {
  const p = centre(card);
  const c = Math.floor((p.x - m.x) / m.cellW);
  const r = Math.floor((p.y - m.y) / m.cellH);
  if (r < 0 || c < 0 || r >= m.rows.length || c >= m.cols.length) return null;
  return { r, c };
}

/** Is the point (e.g. a dropped card's centre) over the grid or its labels */
export function isOverMatrix(m: BoardMatrix, card: Card): boolean {
  const p = centre(card);
  return p.x >= m.x && p.y >= m.y && p.x < m.x + matrixWidth(m) && p.y < m.y + matrixHeight(m);
}

/** The card shrunk to fit the cell and centred in it */
export function placeInCell(m: BoardMatrix, card: Card, r: number, c: number): Card {
  const ratio = (card.height || card.width) / card.width;
  let w = m.cellW - PAD * 2;
  let h = w * ratio;
  const maxH = m.cellH - PAD * 2 - 18; // room for the caption under the photo
  if (h > maxH) {
    h = maxH;
    w = h / ratio;
  }
  return {
    ...card,
    width: Math.round(w),
    height: Math.round(h),
    x: Math.round(m.x + c * m.cellW + (m.cellW - w) / 2),
    y: Math.round(m.y + r * m.cellH + PAD),
  };
}

export function membersOf(m: BoardMatrix, cards: Card[]): Map<string, { r: number; c: number }> {
  const out = new Map<string, { r: number; c: number }>();
  cards.forEach((card) => {
    const cell = cellOf(m, card);
    if (cell) out.set(card.id, cell);
  });
  return out;
}

/**
 * Snap the moved cards that landed in the grid. A taken cell passes the photo to the next free cell
 * along the same product; if the line is full, a new angle line is added.
 */
export function snapIntoMatrix(m: BoardMatrix, cards: Card[], movedIds: string[]): { matrix: BoardMatrix; cards: Card[] } {
  let matrix = m;
  const moved = new Set(movedIds);
  const taken = new Set<string>();
  cards.forEach((card) => {
    if (moved.has(card.id)) return;
    const cell = cellOf(matrix, card);
    if (cell) taken.add(`${cell.r}:${cell.c}`);
  });
  const updates = new Map<string, Card>();
  // keep the order the photos were laid out in
  const toPlace = cards.filter((c) => moved.has(c.id) && cellOf(matrix, c)).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const card of toPlace) {
    let { r, c } = cellOf(matrix, card)!;
    const alongCols = matrix.productsAlong === 'rows'; // a product's angles go across the columns
    while (taken.has(`${r}:${c}`)) {
      if (alongCols) {
        c++;
        if (c >= matrix.cols.length) matrix = { ...matrix, cols: [...matrix.cols, `Ракурс ${matrix.cols.length + 1}`] };
      } else {
        r++;
        if (r >= matrix.rows.length) matrix = { ...matrix, rows: [...matrix.rows, `Ракурс ${matrix.rows.length + 1}`] };
      }
    }
    taken.add(`${r}:${c}`);
    updates.set(card.id, placeInCell(matrix, card, r, c));
  }
  return { matrix, cards: cards.map((c) => updates.get(c.id) || c) };
}

/** Swap the axes on screen: rows become columns, cards follow their cell */
export function transposeMatrix(m: BoardMatrix, cards: Card[]): { matrix: BoardMatrix; cards: Card[] } {
  const members = membersOf(m, cards);
  const matrix: BoardMatrix = {
    ...m,
    rows: m.cols,
    cols: m.rows,
    cellW: m.cellW,
    cellH: m.cellH,
    productsAlong: m.productsAlong === 'rows' ? 'cols' : 'rows',
  };
  return {
    matrix,
    cards: cards.map((card) => {
      const cell = members.get(card.id);
      return cell ? placeInCell(matrix, card, cell.c, cell.r) : card;
    }),
  };
}

export function addLine(m: BoardMatrix, axis: 'rows' | 'cols'): BoardMatrix {
  const isProducts = m.productsAlong === axis;
  const list = m[axis];
  const label = isProducts ? `Товар ${list.length + 1}` : `Ракурс ${list.length + 1}`;
  const lineProductIds = isProducts && m.lineProductIds ? [...m.lineProductIds, null] : m.lineProductIds;
  return { ...m, [axis]: [...list, label], lineProductIds };
}

/** Remove one line; its photos stay on the board just below the grid, later lines shift back */
export function removeLine(m: BoardMatrix, axis: 'rows' | 'cols', idx: number, cards: Card[]): { matrix: BoardMatrix; cards: Card[] } {
  if (m[axis].length <= 1) return { matrix: m, cards };
  const members = membersOf(m, cards);
  const matrix: BoardMatrix = {
    ...m,
    [axis]: m[axis].filter((_, i) => i !== idx),
    lineProductIds: m.productsAlong === axis && m.lineProductIds ? m.lineProductIds.filter((_, i) => i !== idx) : m.lineProductIds,
  };
  let outX = m.x;
  const outY = m.y + matrixHeight(matrix) + 60;
  return {
    matrix,
    cards: cards.map((card) => {
      const cell = members.get(card.id);
      if (!cell) return card;
      const k = axis === 'rows' ? cell.r : cell.c;
      if (k === idx) {
        const moved = { ...card, x: outX, y: outY };
        outX += card.width + 24;
        return moved;
      }
      if (k > idx) return axis === 'rows' ? placeInCell(matrix, card, cell.r - 1, cell.c) : placeInCell(matrix, card, cell.r, cell.c - 1);
      return card;
    }),
  };
}

/** Photos grouped by product line: [product label, photos by angle (null = empty cell)] */
export function productLines(m: BoardMatrix, cards: Card[]): { name: string; productId: string | null; photos: (Card | null)[] }[] {
  const members = membersOf(m, cards);
  const products = m.productsAlong === 'rows' ? m.rows : m.cols;
  const angles = m.productsAlong === 'rows' ? m.cols : m.rows;
  return products.map((name, p) => ({
    name,
    productId: m.lineProductIds?.[p] ?? null,
    photos: angles.map((_, a) => {
      const hit = cards.find((card) => {
        const cell = members.get(card.id);
        if (!cell) return false;
        return m.productsAlong === 'rows' ? cell.r === p && cell.c === a : cell.c === p && cell.r === a;
      });
      return hit || null;
    }),
  }));
}

export type PositionDraft = Omit<ProductItem, 'id'> & { productId: string | null };

/**
 * Each product line with at least one photo → a position (first photo = original, the rest by angle).
 * `fullSize` gives back the full-size photo for a card that came from a position cell.
 */
export function matrixToPositionDrafts(m: BoardMatrix, cards: Card[], fullSize?: (card: Card) => string | undefined): PositionDraft[] {
  return productLines(m, cards)
    .map((line): PositionDraft | null => {
      const filled = line.photos.map((c) => (c ? fullSize?.(c) || c.src : null));
      const first = filled.findIndex(Boolean);
      if (first < 0) return null;
      const rest = filled.slice(first + 1);
      while (rest.length && !rest[rest.length - 1]) rest.pop();
      return { name: line.name, productId: line.productId, photoDataUrl: filled[first] as string, variants: rest };
    })
    .filter((x): x is PositionDraft => x !== null);
}

/**
 * Positions → a grid on the board: one line per product, its photos across (original first).
 * `dims` gives each photo's width/height ratio so the cards keep their shape.
 */
export function matrixFromPositions(
  x: number,
  y: number,
  products: ProductItem[],
  ratioOf: (src: string) => number
): { matrix: BoardMatrix; cards: Card[] } {
  const photosOf = (p: ProductItem) => [p.photoDataUrl, ...(p.variants || [])];
  const cols = Math.max(1, ...products.map((p) => photosOf(p).length));
  const matrix = newMatrix(x, y, Math.max(1, products.length), cols);
  matrix.name = 'Позиции';
  matrix.linked = true;
  matrix.rows = products.map((p) => p.name || 'Товар');
  matrix.cols = Array.from({ length: cols }, (_, i) => (i === 0 ? 'исходник' : `ракурс ${i + 1}`));
  matrix.lineProductIds = products.map((p) => p.id);
  const cards: Card[] = [];
  let z = 1;
  products.forEach((p, r) =>
    photosOf(p).forEach((src, c) => {
      if (!src) return;
      const ratio = ratioOf(src) || 1;
      const base: Card = {
        id: `card_pos_${p.id}_${c}_${Math.random().toString(36).slice(2, 6)}`,
        x: 0,
        y: 0,
        width: 200,
        height: Math.round(200 * ratio),
        src,
        name: [p.name, p.angles?.[String(c - 1)]].filter(Boolean).join(' · '),
        aspectRatio: 1 / ratio,
        zIndex: ++z,
        fromSlot: { productId: p.id, slot: c - 1 },
      };
      cards.push(placeInCell(matrix, base, r, c));
    })
  );
  return { matrix, cards };
}

/** A grid for photos already sorted into groups: each group becomes a product line */
export function matrixFromGroups(
  x: number,
  y: number,
  lines: { name: string; cards: Card[] }[]
): { matrix: BoardMatrix; cards: Card[] } {
  const maxPhotos = Math.max(1, ...lines.map((l) => l.cards.length));
  const matrix = newMatrix(x, y, Math.max(1, lines.length), maxPhotos);
  matrix.rows = lines.map((l, i) => l.name || `Товар ${i + 1}`);
  const placed: Card[] = [];
  lines.forEach((l, r) => l.cards.forEach((card, c) => placed.push(placeInCell(matrix, card, r, c))));
  return { matrix, cards: placed };
}
