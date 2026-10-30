// Small things shared by App and its hooks

export interface CanvasCropQueueItem {
  id: string;
  name: string;
  rawSrc: string;
  atCanvasPos?: { x: number; y: number };
}

export function getDistanceBetweenRects(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number }
): number {
  const dx = Math.max(0, Math.max(r1.x - (r2.x + r2.width), r2.x - (r1.x + r1.width)));
  const dy = Math.max(0, Math.max(r1.y - (r2.y + r2.height), r2.y - (r1.y + r1.height)));
  return Math.sqrt(dx * dx + dy * dy);
}

export const STUDIO_HOME_HOST = 'ai-product-photo-studio-seven.vercel.app';

export const isDeploymentCopy =
  typeof window !== 'undefined' &&
  window.location.hostname.endsWith('.vercel.app') &&
  window.location.hostname !== STUDIO_HOME_HOST;

/** Side panels in the right dock */
export type DockId = 'products' | 'ai' | 'menu';
