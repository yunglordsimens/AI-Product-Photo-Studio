import { Card } from '../types';

export const API_KEY_STORAGE_KEY = 'aips_api_key';
export const STUDIO_PASSWORD_STORAGE_KEY = 'aips_studio_password';
export const IMAGE_MODEL_STORAGE_KEY = 'aips_image_model';
export const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';
export const TEXT_MODEL = 'gemini-2.5-flash';

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
  return readLocal(IMAGE_MODEL_STORAGE_KEY) || DEFAULT_IMAGE_MODEL;
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

/**
 * Sends a generateContent request either directly (personal key in this browser)
 * or through the private server proxy (/api/gemini) protected by the studio password.
 */
export async function callGemini(
  model: string,
  payload: Record<string, unknown>,
  apiKeyOverride?: string
): Promise<any> {
  const personalKey = (apiKeyOverride ?? getStoredApiKey()).trim();
  let response: Response;

  if (personalKey) {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': personalKey },
        body: JSON.stringify(payload),
      }
    );
  } else {
    const password = getStudioPassword();
    if (!password) {
      throw new GeminiHttpError('Нет доступа: укажите пароль студии или личный API-ключ в настройках', 401);
    }
    response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-studio-password': password },
      body: JSON.stringify({ model, payload }),
    });
  }

  let json: any = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    const msg = json?.error?.message || json?.error || `HTTP ${response.status}`;
    if (response.status === 401) {
      throw new GeminiHttpError('Неверный пароль студии (проверьте настройки)', 401);
    }
    if (response.status === 413) {
      throw new GeminiHttpError('Слишком большие картинки для запроса. Уменьшите фото.', 413);
    }
    throw new GeminiHttpError(`Ошибка ${model}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`, response.status);
  }
  return json;
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
    temperature?: number;
    aspectRatio?: string;
    model?: string;
  }
): Promise<GenerateImageResult> {
  let promptText = '';
  if (options?.customPromptOverride) {
    promptText = options.customPromptOverride.trim();
  } else if (options?.isProductReplacement) {
    promptText = `Замени продукт на фотографии на такой же, но в стиле приложенных референсов. Сохрани форму, цвет и текстуру продукта. ${userPrompt || ''}`.trim();
  } else {
    promptText = `Сгенерируй изображение в стиле приложенных референсов. ${userPrompt || ''}`.trim();
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
      temperature: options?.temperature ?? 0.9,
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
