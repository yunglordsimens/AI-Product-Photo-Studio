import { Card } from '../types';

export const API_KEY_STORAGE_KEY = 'aips_api_key';

export function getStoredApiKey(): string {
  try {
    const fromStorage = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (fromStorage && fromStorage.trim().length > 0) {
      return fromStorage.trim();
    }
    // Fallback to environment variable if configured on Vercel / deployment
    const envKey = (import.meta as unknown as { env?: { VITE_GEMINI_API_KEY?: string } }).env?.VITE_GEMINI_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim().length > 0) {
      return envKey.trim();
    }
    return '';
  } catch {
    return '';
  }
}

export function setStoredApiKey(key: string): void {
  try {
    localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
  } catch (err) {
    console.error('Failed to save API key to localStorage', err);
  }
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
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Введите API-ключ Gemini в настройках');
  }

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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseJson = await response.json();

  if (!response.ok) {
    const errorMsg =
      responseJson?.error?.message ||
      responseJson?.error?.status ||
      `HTTP ${response.status}`;
    throw new Error(`Ошибка анализа стиля (gemini-2.5-flash): ${errorMsg}`);
  }

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
  }
): Promise<GenerateImageResult> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Введите API-ключ в настройках');
  }

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
      temperature: 0.9,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
      responseModalities: ['image', 'text'],
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey.trim()}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseJson = await response.json();

  if (!response.ok) {
    const errorMsg =
      responseJson?.error?.message ||
      responseJson?.error?.status ||
      `HTTP ${response.status}`;
    throw new Error(`Ошибка генерации (gemini-2.5-flash-image): ${errorMsg}`);
  }

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
    throw new Error('Модель gemini-2.5-flash-image не вернула данные изображения.');
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
