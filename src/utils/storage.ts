import { Card, Connection, MasterPrompt, Project, ProductItem, StorageInfo } from '../types';
import { createSampleCard } from './imageUtils';
import { idbGet, idbSet, idbDelete, idbClear, getDiskStorageUsage } from './indexedDb';

export const STORAGE_KEY_PROJECTS = 'aips_projects';
export const STORAGE_KEY_ACTIVE_ID = 'aips_active_project_id';
export const STORAGE_KEY_MASTER_PROMPTS = 'aips_master_prompts';
export const STORAGE_KEY_GLOBAL_PRODUCTS = 'aips_products_library';
export const STORAGE_KEY_API_KEY = 'aips_api_key';

export const DEFAULT_MASTER_PROMPTS: MasterPrompt[] = [
  {
    id: 'mp_dark_studio',
    name: 'Каталожный тёмный фон',
    prompt: 'Профессиональная студийная предметная съемка на матовом темном графитовом подиуме, драматичный контрастный контровой свет, мягкие тени, премиальный минимализм, 8k, фотореализм',
    tags: ['каталог', 'темный фон', 'студия', 'премиум'],
    createdAt: 1700000000000,
  },
  {
    id: 'mp_white_marketplace',
    name: 'Чистый белый фон (Ozon / WB)',
    prompt: 'Идеально чистый бесшовный белый фон для карточки товара Wildberries и Ozon, мягкий рассеянный софтбокс, естественные реалистичные тени под предметом, четкие контуры и детальная фактура',
    tags: ['маркетплейс', 'белый фон', 'wb', 'ozon'],
    createdAt: 1700000001000,
  },
  {
    id: 'mp_lifestyle_interior',
    name: 'Уютный интерьер / Лайфстайл',
    prompt: 'Теплый естественный дневной свет из окна, фон уютной скандинавской комнаты с деревянной столешницей, легкий эффект боке (размытие фона), эстетика Pinterest, живая теплая атмосфера',
    tags: ['лайфстайл', 'интерьер', 'уют', 'дерево'],
    createdAt: 1700000002000,
  },
  {
    id: 'mp_marble_water',
    name: 'Мраморный подиум и капли воды',
    prompt: 'Роскошная композиция на белом мраморном постаменте, легкие брызги и рябь прозрачной чистой воды, солнечные блики и каустика, свежесть, глянец, журнальная реклама',
    tags: ['косметика', 'вода', 'мрамор', 'глянец'],
    createdAt: 1700000003000,
  },
  {
    id: 'mp_nature_eco',
    name: 'Эко / Природные материалы',
    prompt: 'Органический эко-стиль, основа из фактурного камня или спила натурального дерева, веточки эвкалипта, сухоцветы, теплый золотистый солнечный свет, природные текстуры',
    tags: ['эко', 'природа', 'камень', 'растения'],
    createdAt: 1700000004000,
  },
];

export function getInitialProjects(): Project[] {
  const sampleCard1 = createSampleCard(
    'card_sample_1',
    'Éclat Rose Parfum',
    'Perfume',
    120,
    100,
    { bg1: '#fff1f2', bg2: '#ffe4e6', accent: '#f43f5e', icon: 'sparkles' }
  );

  const sampleCard2 = createSampleCard(
    'card_sample_2',
    'AeroPulse Runner',
    'Footwear',
    440,
    100,
    { bg1: '#eff6ff', bg2: '#dbeafe', accent: '#3b82f6', icon: 'zap' }
  );

  const sampleCard3 = createSampleCard(
    'card_sample_3',
    'Quantum Apex Watch',
    'Cosmetic',
    760,
    100,
    { bg1: '#f5f3ff', bg2: '#ede9fe', accent: '#8b5cf6', icon: 'watch' }
  );

  return [
    {
      id: 'proj_' + Date.now(),
      name: 'Проект 1 — Студия 2026',
      cards: [sampleCard1, sampleCard2, sampleCard3],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pan: { x: 80, y: 80 },
      zoom: 1,
    },
  ];
}

// In-memory cache for ultra-fast sync rendering
let inMemoryProjectsCache: Project[] | null = null;
let inMemoryMasterPromptsCache: MasterPrompt[] | null = null;
let inMemoryProductsCache: ProductItem[] | null = null;

/**
 * Loads projects from IndexedDB with transparent fallback and migration from localStorage.
 */
export async function loadProjectsAsync(): Promise<Project[]> {
  try {
    // 1. Try to read from IndexedDB
    const fromIdb = await idbGet<Project[]>(STORAGE_KEY_PROJECTS);
    if (fromIdb && Array.isArray(fromIdb) && fromIdb.length > 0) {
      inMemoryProjectsCache = fromIdb;
      return fromIdb;
    }

    // 2. Migration: Check if user has legacy data in localStorage
    const rawLocal = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (rawLocal) {
      try {
        const parsed = JSON.parse(rawLocal);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryProjectsCache = parsed;
          // Save to IndexedDB
          await idbSet(STORAGE_KEY_PROJECTS, parsed);
          // Free localStorage space safely
          try {
            localStorage.removeItem(STORAGE_KEY_PROJECTS);
          } catch {}
          return parsed;
        }
      } catch (err) {
        console.warn('Failed to parse legacy localStorage projects:', err);
      }
    }

    // 3. Fresh instance
    const initial = getInitialProjects();
    inMemoryProjectsCache = initial;
    await idbSet(STORAGE_KEY_PROJECTS, initial);
    return initial;
  } catch (err) {
    console.error('Error loading projects:', err);
    const initial = getInitialProjects();
    inMemoryProjectsCache = initial;
    return initial;
  }
}

/**
 * Synchronous accessor (uses memory cache or initial template if not yet hydrated).
 */
export function loadProjects(): Project[] {
  if (inMemoryProjectsCache && inMemoryProjectsCache.length > 0) {
    return inMemoryProjectsCache;
  }
  // Try localStorage synchronous fallback during initial SSR / cold start
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryProjectsCache = parsed;
        return parsed;
      }
    }
  } catch {}

  const initial = getInitialProjects();
  inMemoryProjectsCache = initial;
  return initial;
}

/**
 * Persists projects to IndexedDB without blocking the UI.
 */
export function saveProjects(projects: Project[]): boolean {
  inMemoryProjectsCache = projects;
  idbSet(STORAGE_KEY_PROJECTS, projects).catch((err) => {
    console.error('Failed to save projects to IndexedDB:', err);
  });
  return true;
}

export function getActiveProjectId(projects: Project[]): string {
  try {
    const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
    if (activeId && projects.some((p) => p.id === activeId)) {
      return activeId;
    }
  } catch {}
  return projects[0]?.id || '';
}

export function setActiveProjectId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_ID, id);
  } catch {}
}

/**
 * Accurate storage calculation utilizing browser quota (Gigabytes in IndexedDB).
 */
export async function getStorageUsageAsync(): Promise<StorageInfo> {
  const usage = await getDiskStorageUsage();
  return {
    usedBytes: usage.usedBytes,
    maxBytes: usage.maxBytes,
    percentage: usage.percentage,
  };
}

export function getStorageUsage(): StorageInfo {
  // Approximate synchronous calculation
  let approxBytes = 0;
  if (inMemoryProjectsCache) {
    try {
      approxBytes += JSON.stringify(inMemoryProjectsCache).length * 2;
    } catch {}
  }
  if (inMemoryProductsCache) {
    try {
      approxBytes += JSON.stringify(inMemoryProductsCache).length * 2;
    } catch {}
  }
  const maxBytes = 10 * 1024 * 1024 * 1024; // 10 GB standard IndexedDB quota
  const percentage = Math.min(100, Math.round((approxBytes / maxBytes) * 100));
  return {
    usedBytes: approxBytes,
    maxBytes,
    percentage,
  };
}

export async function clearAllMemoryAsync(): Promise<void> {
  const confirmed = window.confirm('Точно очистить все проекты и карточки?');
  if (!confirmed) return;

  const apiKey = localStorage.getItem(STORAGE_KEY_API_KEY);
  try {
    await idbClear();
    localStorage.clear();
    if (apiKey) {
      localStorage.setItem(STORAGE_KEY_API_KEY, apiKey);
    }
  } catch (err) {
    console.error('Failed to clear IndexedDB:', err);
  }
  window.location.reload();
}

export function clearAllMemory(): void {
  clearAllMemoryAsync();
}

export function compressImageDataUrl(
  dataUrl: string,
  maxDimension = 1200,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }
    if (dataUrl.startsWith('data:image/svg+xml')) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;
      if (!width || !height) {
        resolve(dataUrl);
        return;
      }

      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const optimized = canvas.toDataURL('image/jpeg', quality);
      resolve(optimized);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function optimizeAllProjectsMemory(): Promise<{
  freedMb: string;
  freedBytes: number;
  optimizedCards: number;
  updatedProjects: Project[];
}> {
  const currentProjects = inMemoryProjectsCache || (await loadProjectsAsync());
  let beforeBytes = 0;
  try {
    beforeBytes = JSON.stringify(currentProjects).length * 2;
  } catch {}

  let optimizedCards = 0;
  for (const proj of currentProjects) {
    if (Array.isArray(proj.cards)) {
      for (const card of proj.cards) {
        if (card.src && card.src.startsWith('data:image/')) {
          const originalSrc = card.src;
          const compressed = await compressImageDataUrl(originalSrc, 800, 0.8);
          if (compressed !== originalSrc && compressed.length < originalSrc.length) {
            card.src = compressed;
            optimizedCards++;
          }
        }
      }
    }
  }

  saveProjects(currentProjects);

  let afterBytes = 0;
  try {
    afterBytes = JSON.stringify(currentProjects).length * 2;
  } catch {}

  const freedBytes = Math.max(0, beforeBytes - afterBytes);
  const freedMb = (freedBytes / (1024 * 1024)).toFixed(2);

  return {
    freedMb,
    freedBytes,
    optimizedCards,
    updatedProjects: currentProjects,
  };
}

export function exportProjectToJson(project: Project): void {
  const dataStr =
    'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(project, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  const cleanName = project.name.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase() || 'project';
  downloadAnchor.setAttribute('download', `${cleanName}_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function parseProjectJson(file: File): Promise<Project> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const project = JSON.parse(content) as Project;
        if (!project || !Array.isArray(project.cards)) {
          throw new Error('Некорректный формат файла проекта');
        }
        if (!project.id) project.id = 'proj_' + Date.now();
        if (!project.name) project.name = file.name.replace(/\.json$/i, '');
        if (!project.pan) project.pan = { x: 100, y: 100 };
        if (!project.zoom) project.zoom = 1;
        if (!project.connections) project.connections = [];
        resolve(project);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsText(file);
  });
}

// Master Prompts Persistence
export async function loadMasterPromptsAsync(): Promise<MasterPrompt[]> {
  try {
    const fromIdb = await idbGet<MasterPrompt[]>(STORAGE_KEY_MASTER_PROMPTS);
    if (fromIdb && Array.isArray(fromIdb) && fromIdb.length > 0) {
      inMemoryMasterPromptsCache = fromIdb;
      return fromIdb;
    }

    const raw = localStorage.getItem(STORAGE_KEY_MASTER_PROMPTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryMasterPromptsCache = parsed;
        await idbSet(STORAGE_KEY_MASTER_PROMPTS, parsed);
        return parsed;
      }
    }

    inMemoryMasterPromptsCache = DEFAULT_MASTER_PROMPTS;
    await idbSet(STORAGE_KEY_MASTER_PROMPTS, DEFAULT_MASTER_PROMPTS);
    return DEFAULT_MASTER_PROMPTS;
  } catch {
    inMemoryMasterPromptsCache = DEFAULT_MASTER_PROMPTS;
    return DEFAULT_MASTER_PROMPTS;
  }
}

export function loadMasterPrompts(): MasterPrompt[] {
  if (inMemoryMasterPromptsCache) return inMemoryMasterPromptsCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MASTER_PROMPTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryMasterPromptsCache = parsed;
        return parsed;
      }
    }
  } catch {}
  inMemoryMasterPromptsCache = DEFAULT_MASTER_PROMPTS;
  return DEFAULT_MASTER_PROMPTS;
}

export function saveMasterPrompts(prompts: MasterPrompt[]): boolean {
  inMemoryMasterPromptsCache = prompts;
  idbSet(STORAGE_KEY_MASTER_PROMPTS, prompts).catch((err) => {
    console.error('Failed to save master prompts to IndexedDB:', err);
  });
  return true;
}

// Global Products Persistence
export async function loadGlobalProductsAsync(): Promise<ProductItem[]> {
  try {
    const fromIdb = await idbGet<ProductItem[]>(STORAGE_KEY_GLOBAL_PRODUCTS);
    if (fromIdb && Array.isArray(fromIdb)) {
      inMemoryProductsCache = fromIdb;
      return fromIdb;
    }

    const raw = localStorage.getItem(STORAGE_KEY_GLOBAL_PRODUCTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inMemoryProductsCache = parsed;
        await idbSet(STORAGE_KEY_GLOBAL_PRODUCTS, parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to load global products:', err);
  }
  inMemoryProductsCache = [];
  return [];
}

export function loadGlobalProducts(): ProductItem[] {
  if (inMemoryProductsCache) return inMemoryProductsCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GLOBAL_PRODUCTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inMemoryProductsCache = parsed;
        return parsed;
      }
    }
  } catch {}
  inMemoryProductsCache = [];
  return [];
}

export function saveGlobalProducts(products: ProductItem[]): void {
  inMemoryProductsCache = products;
  idbSet(STORAGE_KEY_GLOBAL_PRODUCTS, products).catch((err) => {
    console.error('Failed to save global products to IndexedDB:', err);
  });
}
