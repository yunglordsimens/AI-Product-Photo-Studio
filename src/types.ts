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
  /** A photo put on the board from a position cell: keeps the link to its full-size original */
  fromSlot?: { productId: string; slot: number };
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
  /** What each photo shows, by cell: "-1" = the original, "0".. = the next columns (общее, бок, деталь, в действии…) */
  angles?: Record<string, string>;
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
  /** A small «до / после» showing what the prompt does */
  example?: PromptExample;
  createdAt: number;
}

export interface PromptExample {
  before?: string;
  after: string;
  /** 'auto': the first result made with this prompt; 'manual': picked by hand */
  source: 'auto' | 'manual';
  updatedAt: number;
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
  /** Made from the positions: each product line is tied to a position, «→ в позиции» updates it instead of adding a new one */
  linked?: boolean;
  /** Position id per product line (same order as the product axis), null for a line added by hand */
  lineProductIds?: (string | null)[];
}

export type PackagingNicotineStatus = 'unknown' | 'none' | 'contains';

export interface PackagingArtworkText {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: string;
}

/** A small editable intake record for the first Packaging Studio prototype. */
export interface PackagingBrief {
  market: string;
  productType: string;
  nicotine: PackagingNicotineStatus;
  nicotineDetails?: string;
  brandName: string;
  productName: string;
  packagingFormat: string;
  desiredLogo: string;
  suppliedCopy: string;
  printerRequirements: string;
  dielineName: string;
  dielineSvg?: string;
  dielineWidthMm?: number;
  dielineHeightMm?: number;
  dielineViewBox?: string;
  dielineText?: string[];
  artworkText?: PackagingArtworkText[];
  aiSummary?: string;
  clientQuestions?: string[];
  updatedAt: number;
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
  /** Packaging intake and dieline data live with this project and follow its cloud sync. */
  packaging?: PackagingBrief;
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
