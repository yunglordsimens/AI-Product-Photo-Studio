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
}

export interface MasterPrompt {
  id: string;
  name: string;
  prompt: string;
  tags?: string[];
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

export interface Project {
  id: string;
  name: string;
  cards: Card[];
  notes?: Note[];
  connections?: Connection[];
  groups?: CardGroup[];
  products?: ProductItem[];
  siteMockup?: SiteMockup;
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
