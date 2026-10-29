/**
 * «разрезать на товары»: a photo with many products on a table → one photo per product.
 * The text model finds each product and returns its box; the cutting itself happens here, on a canvas.
 */
import { callGemini, extractBase64FromDataUrl, extractTextFromResponse, TEXT_MODEL } from './gemini';

export interface FoundProduct {
  label: string;
  /** [ymin, xmin, ymax, xmax], 0–1000 */
  box: [number, number, number, number];
}

export async function detectProducts(src: string): Promise<FoundProduct[]> {
  const data = extractBase64FromDataUrl(src);
  if (!data) throw new Error('Не удалось прочитать фото');
  const json = await callGemini(TEXT_MODEL, {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: [
              'Find every separate product (item for sale) in this photo. Skip the table, background, hands and decorations.',
              'If several identical items stand together, return each one separately.',
              'Answer with JSON only: an array of objects {"label": short name of the product as written on it or a short description, "box_2d": [ymin, xmin, ymax, xmax]} with coordinates normalised to 0–1000.',
            ].join('\n'),
          },
          { inline_data: { mime_type: data.mimeType, data: data.base64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  });
  const text = extractTextFromResponse(json).replace(/^```(?:json)?\s*|\s*```$/g, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Модель ответила не списком товаров');
  }
  const list = Array.isArray(parsed) ? parsed : [];
  return list
    .map((x: any): FoundProduct | null => {
      const b = x?.box_2d || x?.box;
      if (!Array.isArray(b) || b.length !== 4 || b.some((v: unknown) => typeof v !== 'number')) return null;
      const [ymin, xmin, ymax, xmax] = b as number[];
      if (ymax - ymin < 15 || xmax - xmin < 15) return null;
      return { label: String(x.label || 'товар').slice(0, 80), box: [ymin, xmin, ymax, xmax] };
    })
    .filter((x): x is FoundProduct => x !== null);
}

/** Cut each box out of the photo, with a little air around it */
export async function cropProducts(src: string, found: FoundProduct[], pad = 0.06): Promise<{ label: string; src: string; w: number; h: number }[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Не удалось открыть фото'));
    i.src = src;
  });
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  return found.map((f) => {
    const [ymin, xmin, ymax, xmax] = f.box;
    const bw = ((xmax - xmin) / 1000) * W;
    const bh = ((ymax - ymin) / 1000) * H;
    const x0 = Math.max(0, (xmin / 1000) * W - bw * pad);
    const y0 = Math.max(0, (ymin / 1000) * H - bh * pad);
    const x1 = Math.min(W, (xmax / 1000) * W + bw * pad);
    const y1 = Math.min(H, (ymax / 1000) * H + bh * pad);
    const w = Math.max(1, Math.round(x1 - x0));
    const h = Math.max(1, Math.round(y1 - y0));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, x0, y0, w, h, 0, 0, w, h);
    return { label: f.label, src: canvas.toDataURL('image/jpeg', 0.92), w, h };
  });
}
