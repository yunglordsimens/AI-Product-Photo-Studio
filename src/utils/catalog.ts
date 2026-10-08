/**
 * Catalog mode: one style recipe → the same shot for every product.
 *
 * Each client photo is sent with 1–3 style references and a fixed recipe at low
 * temperature, so the model changes only the "packaging" (background, light,
 * angle, crop, grade) and keeps the subject itself.
 */
import {
  callGemini,
  extractImageFromResponse,
  extractTextFromResponse,
  extractBase64FromDataUrl,
  getImageModel,
  TEXT_MODEL,
} from './gemini';
import { idbGet, idbSet } from './indexedDb';

export type CatalogCategory = 'food' | 'product' | 'packaging' | 'event';

export type ResultStatus = 'running' | 'done' | 'error';

export interface CatalogResult {
  src?: string;
  status: ResultStatus;
  error?: string;
  approved?: boolean;
  updatedAt: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  original: string; // data URL (compressed)
  results: Record<string, CatalogResult>; // by version id
}

export interface CatalogRef {
  id: string;
  name: string;
  src: string; // data URL (compressed)
}

export interface CatalogVersion {
  id: string;
  label: string;
  recipe: string;
  category: CatalogCategory;
  aspectRatio: string;
  temperature: number;
  refIds: string[];
  model: string;
  createdAt: number;
}

export interface CatalogState {
  refs: CatalogRef[];
  recipe: string;
  category: CatalogCategory;
  aspectRatio: string;
  temperature: number;
  items: CatalogItem[];
  versions: CatalogVersion[];
  activeVersionId?: string;
}

export const ASPECT_RATIOS = ['1:1', '4:5', '3:4', '2:3', '5:4', '4:3', '3:2', '16:9', '9:16'];

export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  food: 'Еда и напитки',
  product: 'Товар',
  packaging: 'Упаковка / флаконы',
  event: 'Залы и события',
};

/** What must never change, per category. Added to every prompt. */
const CATEGORY_GUARDS: Record<CatalogCategory, string> = {
  food:
    'This is a real dish from a real menu. Keep the exact same dish: same portion size, same ingredients, same garnish, same plate or cup contents. Do not add, remove or "improve" any food. Customers must receive what they see.',
  product:
    'Keep the exact same product: identical shape, proportions, colours, materials, stitching, hardware and details. Do not redesign or idealise it.',
  packaging:
    'Keep the exact same packaging: identical shape, cap, colours and proportions. Reproduce every label, logo and printed text exactly as in the original; never invent, translate or garble text. If text cannot be reproduced exactly, keep it as in the original photo.',
  event:
    'This is a real event photo. Enhance only: exposure, colour, sharpness, noise, framing. Never add or remove people, objects, signage or crowd. Do not change any facts of the scene.',
};

/** What the reviewer should check by eye, per category. */
export const CATEGORY_CHECKS: Record<CatalogCategory, string> = {
  food: 'Проверь: то же блюдо, та же порция и ингредиенты.',
  product: 'Проверь: форма, цвет и детали товара не изменились.',
  packaging: 'Проверь текст на этикетках: модели любят его коверкать.',
  event: 'Проверь: никого не добавили и ничего не дорисовали.',
};

export const DEFAULT_RECIPES: Record<CatalogCategory, string> = {
  food: [
    'Angle: 45° three-quarter view, slightly above the table.',
    'Background: warm light stone table, softly blurred.',
    'Light: soft daylight from the left, gentle natural shadow to the right.',
    'Framing: dish centred, fills about 70% of the frame, small even margin.',
    'Colour: natural, appetising, no heavy filters.',
    'Props: none.',
  ].join('\n'),
  product: [
    'Angle: straight-on, lens at product mid-height.',
    'Background: seamless light grey studio paper.',
    'Light: large soft box from the front-left, soft fill, gentle contact shadow.',
    'Framing: product centred, fills about 70% of the frame.',
    'Colour: neutral, true-to-life.',
    'Props: none.',
  ].join('\n'),
  packaging: [
    'Angle: straight-on, front label facing camera.',
    'Background: seamless warm beige backdrop.',
    'Light: soft studio light, subtle reflection on glass, soft shadow.',
    'Framing: bottle centred, fills about 65% of the frame height.',
    'Colour: neutral, rich, true-to-life.',
    'Props: none.',
  ].join('\n'),
  event: [
    'Keep the original composition.',
    'Balanced exposure, recover shadows and highlights.',
    'Clean, natural colour; reduce noise; sharpen slightly.',
  ].join('\n'),
};

export function emptyCatalogState(): CatalogState {
  return {
    refs: [],
    recipe: DEFAULT_RECIPES.food,
    category: 'food',
    aspectRatio: '4:5',
    temperature: 0.3,
    items: [],
    versions: [],
  };
}

const storageKey = (projectId: string) => `aips_catalog_${projectId}`;

export async function loadCatalogState(projectId: string): Promise<CatalogState> {
  const saved = await idbGet<CatalogState>(storageKey(projectId));
  return saved ? { ...emptyCatalogState(), ...saved } : emptyCatalogState();
}

export async function saveCatalogState(projectId: string, state: CatalogState): Promise<boolean> {
  return idbSet(storageKey(projectId), state);
}

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function inline(dataUrl: string) {
  const data = extractBase64FromDataUrl(dataUrl);
  if (!data) throw new Error('Не удалось прочитать изображение');
  return { inline_data: { mime_type: data.mimeType, data: data.base64 } };
}

/** The fixed prompt used for every item of a version. */
export function buildShotPrompt(version: Pick<CatalogVersion, 'recipe' | 'category' | 'aspectRatio'>, itemName: string) {
  return [
    'You are a product photographer re-shooting a client catalog so that every photo looks like part of one consistent set.',
    `SUBJECT: "${itemName}". The first image is the client's original photo of it. It is the ground truth for what the subject looks like.`,
    'STYLE: the following image(s) are style references. Match their background, lighting, shadow, camera angle, lens feel, framing and colour grade as closely as possible. Do not copy any object from them.',
    `KEEP: ${CATEGORY_GUARDS[version.category]}`,
    `RECIPE (apply exactly the same way for every item in this catalog):\n${version.recipe.trim()}`,
    `OUTPUT: one photorealistic photograph, aspect ratio ${version.aspectRatio}. No text overlays, no watermark, no borders, no collage.`,
  ].join('\n\n');
}

export async function generateCatalogShot(
  item: CatalogItem,
  version: CatalogVersion,
  refs: CatalogRef[]
): Promise<string> {
  const usedRefs = refs.filter((r) => version.refIds.includes(r.id)).slice(0, 3);
  const parts: Array<Record<string, unknown>> = [
    { text: buildShotPrompt(version, item.name) },
    { text: 'ORIGINAL PHOTO (keep this subject):' },
    inline(item.original),
  ];
  usedRefs.forEach((ref, i) => {
    parts.push({ text: `STYLE REFERENCE ${i + 1}:` });
    parts.push(inline(ref.src));
  });

  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: version.temperature,
      topP: 0.9,
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: { aspectRatio: version.aspectRatio },
    },
  };

  const json = await callGemini(version.model || getImageModel(), payload);
  const image = extractImageFromResponse(json);
  if (!image) {
    const text = extractTextFromResponse(json);
    const reason = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason;
    throw new Error(text ? `Модель ответила текстом: ${text.slice(0, 140)}` : `Модель не вернула фото${reason ? ` (${reason})` : ''}`);
  }
  return `data:${image.mimeType};base64,${image.base64}`;
}

/** Retries rate limits and transient server errors with backoff. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const retryable = status === undefined || status === 429 || status >= 500;
      if (!retryable || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 2500 * (i + 1) + Math.random() * 800));
    }
  }
  throw lastErr;
}

/** Reads the references and writes a recipe in the same line format as the defaults. */
export async function describeRecipeFromRefs(refs: CatalogRef[], category: CatalogCategory): Promise<string> {
  if (refs.length === 0) throw new Error('Сначала добавь эталонные фото');
  const parts: Array<Record<string, unknown>> = [
    {
      text: [
        'These are style reference photos for a product catalog shoot.',
        `Subject type: ${CATEGORY_LABELS[category]}.`,
        'Describe the shared photographic style as a short shooting recipe that a photographer could repeat identically for every product.',
        'Answer in English, exactly these lines and nothing else:',
        'Angle: …',
        'Background: …',
        'Light: … (type, direction, hardness, flash or not)',
        'Shadow: …',
        'Framing: … (subject position, how much of the frame it fills)',
        'Colour: … (palette, contrast, grade)',
        'Props: … (or none)',
      ].join('\n'),
    },
    ...refs.slice(0, 3).map((r) => inline(r.src)),
  ];
  const json = await callGemini(TEXT_MODEL, {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.2 },
  });
  const text = extractTextFromResponse(json);
  if (!text) throw new Error('Модель вернула пустой ответ');
  return text;
}

export function slugify(name: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
    н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
    ы: 'y', э: 'e', ю: 'yu', я: 'ya', ь: '', ъ: '',
  };
  const out = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split('')
    .map((ch) => (ch in map ? map[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return out || 'item';
}

export function fileBaseName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
