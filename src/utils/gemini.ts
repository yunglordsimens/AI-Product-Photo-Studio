import { Card } from '../types';
import { SOURCE_FIX_MARKER } from './storage';

export const API_KEY_STORAGE_KEY = 'aips_api_key';
export const STUDIO_PASSWORD_STORAGE_KEY = 'aips_studio_password';
export const IMAGE_MODEL_STORAGE_KEY = 'aips_image_model';
// Gemini 2.5 models are only served to accounts that used them before (Oct 2026),
// so new keys get an error. Current stable models:
export const DEFAULT_IMAGE_MODEL = 'gemini-nano-banana-2.1';
export const TEXT_MODEL = 'gemini-3.8-flash';

/** Image models offered in settings (any other gemini-* id can be typed in). */
export const IMAGE_MODEL_OPTIONS: { id: string; note: string }[] = [
  { id: 'gemini-nano-banana-2.1', note: 'основная, до 14 референсов' },
  { id: 'gemini-3-pro-image', note: 'максимум качества и точности бренда, дороже' },
  { id: 'gemini-3.1-flash-image', note: 'прошлое поколение' },
  { id: 'gemini-3.1-flash-lite-image', note: 'самая дешёвая, 1K, один референс' },
];

/** Maps retired / restricted model ids to current ones, so old versions and settings keep working. */
export function migrateModel(model: string): string {
  const m = (model || '').trim();
  if (!m) return m;
  if (/^gemini-(1\.|2\.0|2\.5)/i.test(m)) {
    return /image/i.test(m) ? DEFAULT_IMAGE_MODEL : TEXT_MODEL;
  }
  return m;
}

function readLocal(key: string): string {
  try {
    return (localStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
}

function writeLocal(key: string, value: string): void {
  try {
    if (value.trim()) localStorage.setItem(key, value.trim());
    else localStorage.removeItem(key);
  } catch (err) {
    console.error('Failed to save setting', key, err);
  }
}

/**
 * Personal Gemini key stored in this browser only (optional).
 * The key is never baked into the bundle: without a personal key, requests go
 * through the private server proxy (/api/gemini), which holds GEMINI_API_KEY.
 */
export function getStoredApiKey(): string {
  return readLocal(API_KEY_STORAGE_KEY);
}

export function setStoredApiKey(key: string): void {
  writeLocal(API_KEY_STORAGE_KEY, key);
}

export function getStudioPassword(): string {
  return readLocal(STUDIO_PASSWORD_STORAGE_KEY);
}

export function setStudioPassword(password: string): void {
  writeLocal(STUDIO_PASSWORD_STORAGE_KEY, password);
}

export function getImageModel(): string {
  return migrateModel(readLocal(IMAGE_MODEL_STORAGE_KEY)) || DEFAULT_IMAGE_MODEL;
}

export function setImageModel(model: string): void {
  writeLocal(IMAGE_MODEL_STORAGE_KEY, model);
}

/** True when generation can run: either a personal key or a studio password for the proxy. */
export function hasGenerationAccess(): boolean {
  return Boolean(getStoredApiKey() || getStudioPassword());
}

export class GeminiHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type GeminiEndpoint = 'generateContent' | 'interactions';

async function postGemini(
  model: string,
  body: Record<string, unknown>,
  endpoint: GeminiEndpoint,
  personalKey: string
): Promise<{ ok: boolean; status: number; json: any }> {
  let response: Response;
  if (personalKey) {
    const url =
      endpoint === 'interactions'
        ? 'https://generativelanguage.googleapis.com/v1beta/interactions'
        : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': personalKey },
      body: JSON.stringify(endpoint === 'interactions' ? { ...body, model } : body),
    });
  } else {
    const password = getStudioPassword();
    if (!password) {
      throw new GeminiHttpError('Нет доступа: укажите пароль студии или личный API-ключ в настройках', 401);
    }
    response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-studio-password': password },
      body: JSON.stringify({ model, payload: body, endpoint }),
    });
  }
  let json: any = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { ok: response.ok, status: response.status, json };
}

function errorMessage(json: any, status: number): string {
  const msg = json?.error?.message || json?.error || `HTTP ${status}`;
  return typeof msg === 'string' ? msg : JSON.stringify(msg);
}

/** New models may only be served through the Interactions API. */
function shouldTryInteractions(status: number, message: string): boolean {
  if (status === 404) return true;
  return status === 400 && /generateContent|interactions|not supported|unsupported|not found/i.test(message);
}

/** Converts a generateContent payload to an Interactions API request body. */
export function toInteractionsBody(payload: Record<string, any>): Record<string, unknown> {
  const parts: any[] = (payload?.contents || []).flatMap((c: any) => c?.parts || []);
  const input = parts
    .map((p) => {
      if (typeof p?.text === 'string') return { type: 'text', text: p.text };
      const inline = p?.inline_data || p?.inlineData;
      if (inline?.data) return { type: 'image', data: inline.data, mime_type: inline.mime_type || inline.mimeType || 'image/jpeg' };
      return null;
    })
    .filter(Boolean);
  const gc = payload?.generationConfig || {};
  const body: Record<string, unknown> = { input };
  const generation: Record<string, unknown> = {};
  if (typeof gc.temperature === 'number') generation.temperature = gc.temperature;
  if (typeof gc.topP === 'number') generation.top_p = gc.topP;
  if (Object.keys(generation).length) body.generation_config = generation;
  const wantsImage =
    Boolean(gc.imageConfig) || (Array.isArray(gc.responseModalities) && gc.responseModalities.some((m: string) => /image/i.test(m)));
  if (wantsImage) {
    const format: Record<string, unknown> = { type: 'image' };
    if (gc.imageConfig?.aspectRatio) format.aspect_ratio = gc.imageConfig.aspectRatio;
    if (gc.imageConfig?.imageSize) format.image_size = gc.imageConfig.imageSize;
    body.response_format = format;
  }
  return body;
}

/** Turns an Interactions API response into the generateContent shape the rest of the app reads. */
export function fromInteractionsResponse(json: any): any {
  const blocks: any[] = [];
  const steps: any[] = Array.isArray(json?.steps) ? json.steps : [];
  const outputSteps = steps.filter((s) => s?.type === 'model_output');
  const roots = outputSteps.length ? outputSteps : [json];
  const seen = new Set<any>();
  const walk = (node: any) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (node.type === 'thought') return;
    if (node.type === 'image' && typeof node.data === 'string') {
      blocks.push({ inlineData: { mimeType: node.mime_type || node.mimeType || 'image/png', data: node.data } });
      return;
    }
    if (node.type === 'text' && typeof node.text === 'string') {
      blocks.push({ text: node.text });
      return;
    }
    for (const v of Array.isArray(node) ? node : Object.values(node)) walk(v);
  };
  roots.forEach(walk);
  return { candidates: [{ content: { parts: blocks } }], _source: 'interactions' };
}

/**
 * Sends a Gemini request either directly (personal key in this browser) or through the
 * private server proxy (/api/gemini) protected by the studio password.
 * Tries generateContent first and falls back to the Interactions API when the model needs it.
 */
export async function callGemini(
  modelIn: string,
  payload: Record<string, unknown>,
  apiKeyOverride?: string
): Promise<any> {
  const model = migrateModel(modelIn);
  const personalKey = (apiKeyOverride ?? getStoredApiKey()).trim();

  let res = await postGemini(model, payload, 'generateContent', personalKey);
  if (!res.ok && shouldTryInteractions(res.status, errorMessage(res.json, res.status))) {
    const second = await postGemini(model, toInteractionsBody(payload as Record<string, any>), 'interactions', personalKey);
    if (second.ok) return fromInteractionsResponse(second.json);
    res = second;
  }

  if (!res.ok) {
    const msg = errorMessage(res.json, res.status);
    if (res.status === 401) {
      throw new GeminiHttpError('Неверный пароль студии (проверьте настройки)', 401);
    }
    if (res.status === 413) {
      throw new GeminiHttpError('Слишком большие картинки для запроса. Уменьшите фото.', 413);
    }
    throw new GeminiHttpError(`Ошибка ${model}: ${msg}`, res.status);
  }
  return res.json;
}

/** Pulls the first image out of a generateContent response. */
export function extractImageFromResponse(json: any): { mimeType: string; base64: string } | null {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) return { mimeType: part.inlineData.mimeType || 'image/png', base64: part.inlineData.data };
    if (part.inline_data?.data) return { mimeType: part.inline_data.mime_type || 'image/png', base64: part.inline_data.data };
  }
  return null;
}

export function extractTextFromResponse(json: any): string {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p: { text?: string }) => p.text || '')
    .join('')
    .trim();
}

/**
 * Extracts base64 and mime type from a data URL or converts an image URL.
 */
export async function getCardBase64Data(card: Card): Promise<{ mimeType: string; base64: string } | null> {
  const match = card.src.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1],
      base64: match[2],
    };
  }

  // If it's a blob: or http URL, load it into a canvas and extract base64
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 512;
        canvas.height = img.naturalHeight || 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const match2 = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (match2) {
          resolve({ mimeType: match2[1], base64: match2[2] });
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = card.src;
  });
}

export interface GenerateImageResult {
  imageUrl: string;
  width: number;
  height: number;
}

export async function analyzeStyleWithGemini(
  apiKey: string,
  referenceCards: Card[]
): Promise<string> {
  if (!referenceCards || referenceCards.length === 0) {
    throw new Error('Пожалуйста, выделите хотя бы одну карточку для анализа стиля');
  }

  const imageParts: Array<{ inline_data: { mime_type: string; data: string } }> = [];
  const selectedToProcess = referenceCards.slice(0, 5);

  for (const card of selectedToProcess) {
    const data = await getCardBase64Data(card);
    if (data) {
      imageParts.push({
        inline_data: {
          mime_type: data.mimeType || 'image/jpeg',
          data: data.base64,
        },
      });
    }
  }

  if (imageParts.length === 0) {
    throw new Error('Не удалось извлечь данные изображений для анализа');
  }

  const promptText =
    'Проанализируй эти изображения как референсы для продукт-фотографии. Выдели ключевые параметры стиля: тип освещения (вспышка, естественное, студийное), направление света, фон, цветовую гамму, контраст, текстуры, композицию, ракурс, наличие реквизита. Выдай ответ в виде списка тегов через запятую, каждый тег начинается с #. Например: #вспышка #тёмный_фон #крупный_план';

  const parts: Array<Record<string, unknown>> = [{ text: promptText }, ...imageParts];

  const payload = {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
  };

  const responseJson = await callGemini(TEXT_MODEL, payload, apiKey);

  const candidate = responseJson?.candidates?.[0];
  if (!candidate) {
    throw new Error('Модель не вернула результатов анализа стиля');
  }

  const responseParts = candidate?.content?.parts || [];
  const textPart = responseParts.find((p: { text?: string }) => Boolean(p.text));
  const resultText = textPart?.text || '';

  if (!resultText.trim()) {
    throw new Error('Модель вернула пустой ответ при анализе стиля.');
  }

  return resultText.trim();
}

/**
 * Helper to extract base64 from a data URL string.
 */
export function extractBase64FromDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1],
      base64: match[2],
    };
  }
  return null;
}

export async function generateImageWithGemini(
  apiKey: string,
  userPrompt: string,
  referenceCards: Card[],
  consideredNotes?: string[],
  options?: {
    productImageDataUrl?: string;
    isProductReplacement?: boolean;
    customPromptOverride?: string;
    photoRole?: 'product' | 'style';
    temperature?: number;
    aspectRatio?: string;
    model?: string;
  }
): Promise<GenerateImageResult> {
  let promptText = '';
  const isSourceFix = (userPrompt || '').includes(SOURCE_FIX_MARKER);
  if (isSourceFix) {
    // Edit the selected photo itself, never invent a new scene
    const task = userPrompt.replace(SOURCE_FIX_MARKER, '').trim();
    promptText =
      'Отредактируй приложенное фото (первое изображение). Это то же самое фото того же предмета: ничего не придумывай, не меняй форму, пропорции, цвет, материал, надписи и логотипы предмета, не добавляй новых объектов. ' +
      `Задача: ${task}`;
  } else if (options?.customPromptOverride) {
    promptText = options.customPromptOverride.trim();
  } else if (options?.isProductReplacement) {
    promptText = `Замени продукт на фотографии на такой же, но в стиле приложенных референсов. Сохрани форму, цвет и текстуру продукта. ${userPrompt || ''}`.trim();
  } else if (options?.photoRole === 'product' && referenceCards.length > 0) {
    promptText =
      'На приложенных фото — продукт клиента. Сохрани его точно: форма, пропорции, цвет, материал, надписи и логотип без изменений, ничего не придумывай на самом продукте. ' +
      `Новую сцену, свет, фон и ракурс сделай так: ${userPrompt || 'чистая студийная предметная съёмка'}`;
  } else {
    promptText = `Сгенерируй изображение в стиле приложенных референсов. ${userPrompt || ''}`.trim();
  }

  // Keep scenes clean: the model likes to add pens, hands and props nobody asked for
  if (!isSourceFix) {
    promptText +=
      ' Кадр чистый: не добавляй предметов, рук, людей, реквизита, надписей, логотипов и водяных знаков, которых нет в задаче или на референсах.';
  }

  // If notes are provided, append them as additional requirements
  if (consideredNotes && consideredNotes.length > 0) {
    const validNotes = consideredNotes.map((n) => n.trim()).filter((n) => n.length > 0);
    if (validNotes.length > 0) {
      promptText += ` Дополнительные требования из заметок: ${validNotes.join(', ')}`;
    }
  }

  // Collect image data parts (up to 6 images including product)
  const imageParts: Array<{ inline_data: { mime_type: string; data: string } }> = [];

  // If product photo is provided (batch mode or product replacement mode), include product photo first
  if (options?.productImageDataUrl) {
    const productData = extractBase64FromDataUrl(options.productImageDataUrl);
    if (productData) {
      imageParts.push({
        inline_data: {
          mime_type: productData.mimeType || 'image/jpeg',
          data: productData.base64,
        },
      });
    }
  }

  const selectedToProcess = referenceCards.slice(0, 5);

  for (const card of selectedToProcess) {
    const data = await getCardBase64Data(card);
    if (data) {
      imageParts.push({
        inline_data: {
          mime_type: data.mimeType || 'image/jpeg',
          data: data.base64,
        },
      });
    }
  }

  const parts: Array<Record<string, unknown>> = [{ text: promptText }, ...imageParts];

  const payload = {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: {
      temperature: options?.temperature ?? (isSourceFix ? 0.2 : options?.photoRole === 'product' ? 0.5 : 0.9),
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
      responseModalities: ['IMAGE', 'TEXT'],
      ...(options?.aspectRatio ? { imageConfig: { aspectRatio: options.aspectRatio } } : {}),
    },
  };

  const model = options?.model || getImageModel();
  const responseJson = await callGemini(model, payload, apiKey);

  const candidate = responseJson?.candidates?.[0];
  if (!candidate) {
    throw new Error('Модель не вернула результатов генерации');
  }

  const responseParts = candidate?.content?.parts || [];
  let generatedBase64 = '';
  let mimeType = 'image/png';

  for (const part of responseParts) {
    if (part.inlineData?.data) {
      generatedBase64 = part.inlineData.data;
      if (part.inlineData.mimeType) mimeType = part.inlineData.mimeType;
      break;
    }
    if (part.inline_data?.data) {
      generatedBase64 = part.inline_data.data;
      if (part.inline_data.mime_type) mimeType = part.inline_data.mime_type;
      break;
    }
  }

  if (!generatedBase64) {
    // Check if there was text output explanation (e.g. safety or instruction refusal)
    const textPart = responseParts.find((p: { text?: string }) => Boolean(p.text));
    if (textPart?.text) {
      throw new Error(`Модель вернула текст вместо изображения: "${textPart.text.slice(0, 150)}..."`);
    }
    throw new Error('Модель не вернула данные изображения.');
  }

  const imageUrl = `data:${mimeType};base64,${generatedBase64}`;
  const dims = await getImageDimensions(imageUrl);
  return { imageUrl, width: dims.width, height: dims.height };
}

async function getImageDimensions(imageUrl: string): Promise<{ width: number; height: number }> {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || 400,
        height: img.naturalHeight || 400,
      });
    };
    img.onerror = () => {
      resolve({ width: 350, height: 350 });
    };
    img.src = imageUrl;
  });
}
