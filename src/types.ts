export type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'white';

export interface Note {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: NoteColor;
  attachedTo: string | null; // id of card or null
  projectId?: string;
  zIndex?: number;
}

/** How a generated card was made, shown under the small "i" on the card. */
export interface GenerationMeta {
  kind: 'generate' | 'product' | 'fix' | 'batch';
  prompt: string;
  masterPromptName?: string;
  productName?: string;
  model: string;
  sourceIds?: string[];
  createdAt: number;
}

export interface Card {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  name?: string;
  aspectRatio?: number;
  zIndex?: number;
  meta?: GenerationMeta;
  /** What to take from this photo when it is used as a reference (see REFERENCE_ROLES) */
  takes?: string[];
}

export interface Connection {
  id: string;
  from: string; // card id
  to: string;   // card id
  auto?: boolean; // drawn automatically: "made from"
}

export interface CardGroup {
  id: string;
  type: 'group';
  name?: string;
  children: string[]; // card ids
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

export interface ProductItem {
  id: string;
  name: string;
  photoDataUrl: string;
  category?: string; // e.g. the subfolder it came from ("Káva", "Poke Bowls")
  sku?: string; // shop id / code, e.g. from a folder "785756834 - Name" or the id column of a CSV
  price?: string;
  variants?: (string | null)[]; // new photos for this position, one per column (data URLs)
  finalIndex?: number; // which photo is the final one: -1 = original, 0.. = variant column
}

export interface MasterPrompt {
  id: string;
  name: string;
  prompt: string;
  tags?: string[];
  /** Shelf in the prompt library (Исходник, Каталог, …); old prompts derive it from tags */
  category?: string;
  /** Set when the prompt belongs to one project only */
  projectId?: string;
  createdAt: number;
}

export interface SiteMockup {
  src: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  scale?: number;
  opacity: number; // 0.1 - 1.0, default 0.5
}

/**
 * «Оси»: a grid on the board. Photos dropped into it snap to cells.
 * One axis is the products, the other is angles / variants; ⇄ swaps them on screen.
 */
export interface BoardMatrix {
  id: string;
  name?: string;
  /** Top-left corner of the first cell (labels sit outside: rows on the left, columns on top) */
  x: number;
  y: number;
  cellW: number;
  cellH: number;
  rows: string[];
  cols: string[];
  /** Which axis lists the products */
  productsAlong: 'rows' | 'cols';
}

export interface Project {
  id: string;
  name: string;
  cards: Card[];
  notes?: Note[];
  connections?: Connection[];
  groups?: CardGroup[];
  products?: ProductItem[];
  siteMockup?: SiteMockup;
  /** Axis grids on the board: one line per product, one cross line per angle / variant */
  matrices?: BoardMatrix[];
  createdAt: number;
  updatedAt: number;
  pan: { x: number; y: number };
  zoom: number;
}

export interface MarqueeBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface StorageInfo {
  usedBytes: number;
  maxBytes: number;
  percentage: number;
}
