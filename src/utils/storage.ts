import { Card, Connection, MasterPrompt, Project, ProductItem, StorageInfo } from '../types';
import { createSampleCard } from './imageUtils';
import { idbGet, idbSet, idbDelete, idbClear, getDiskStorageUsage } from './indexedDb';

export const STORAGE_KEY_PROJECTS = 'aips_projects';
export const STORAGE_KEY_ACTIVE_ID = 'aips_active_project_id';
export const STORAGE_KEY_MASTER_PROMPTS = 'aips_master_prompts';
export const STORAGE_KEY_GLOBAL_PRODUCTS = 'aips_products_library';
export const STORAGE_KEY_API_KEY = 'aips_api_key';

/**
 * "Исправление исходника": edit the client's own photo instead of generating a new scene.
 * Prompts starting with SOURCE_FIX_MARKER switch generation into careful edit mode.
 */
export const SOURCE_FIX_MARKER = '[ИСПРАВИТЬ ИСХОДНИК]';

export const SOURCE_FIX_PROMPTS: MasterPrompt[] = [
  {
    id: 'mp_fix_all',
    name: 'Исходник: поправить всё',
    prompt: `${SOURCE_FIX_MARKER} Выровняй кадр (горизонт и перспектива), поставь предмет ровно, убери пыль, случайные царапины, пятна и отпечатки, исправь экспозицию, баланс белого и шум. Фон и композицию оставь.`,
    tags: ['исходник', 'ретушь'],
    createdAt: 1700000100000,
  },
  {
    id: 'mp_fix_frame',
    name: 'Исходник: выровнять кадр',
    prompt: `${SOURCE_FIX_MARKER} Выровняй кадр: исправь завал горизонта, наклон и перспективные искажения (сходящиеся вертикали). Предмет по центру, ничего больше не меняй.`,
    tags: ['исходник', 'геометрия'],
    createdAt: 1700000101000,
  },
  {
    id: 'mp_fix_object',
    name: 'Исходник: выровнять предмет',
    prompt: `${SOURCE_FIX_MARKER} Поставь сам предмет ровно: если он стоит криво, завален или повёрнут, выпрями его вертикально и симметрично, как на студийной съёмке. Форма, пропорции и детали те же.`,
    tags: ['исходник', 'геометрия'],
    createdAt: 1700000102000,
  },
  {
    id: 'mp_fix_defects',
    name: 'Исходник: убрать случайные дефекты',
    prompt: `${SOURCE_FIX_MARKER} Убери то, что попало случайно: пыль, ворсинки, отпечатки пальцев, мелкие царапины и потёртости, разводы и пятна. Фактуру материала, задуманную состаренность, швы и все надписи оставь как есть.`,
    tags: ['исходник', 'ретушь'],
    createdAt: 1700000103000,
  },
  {
    id: 'mp_fix_light',
    name: 'Исходник: свет и цвет',
    prompt: `${SOURCE_FIX_MARKER} Исправь только свет и цвет: экспозицию, баланс белого, цветовой оттенок, шум и резкость. Естественно, без пересвета и «пластика».`,
    tags: ['исходник', 'цвет'],
    createdAt: 1700000104000,
  },
];

const SOURCE_FIX_ADDED_FLAG = 'aips_source_fix_prompts_v1';

/** Adds the source-fix prompts once to libraries saved before they existed. */
function withSourceFixPrompts(prompts: MasterPrompt[]): MasterPrompt[] {
  try {
    if (localStorage.getItem(SOURCE_FIX_ADDED_FLAG)) return prompts;
    localStorage.setItem(SOURCE_FIX_ADDED_FLAG, '1');
  } catch {
    return prompts;
  }
  const missing = SOURCE_FIX_PROMPTS.filter((fp) => !prompts.some((p) => p.id === fp.id));
  if (missing.length === 0) return prompts;
  const merged = [...missing, ...prompts];
  idbSet(STORAGE_KEY_MASTER_PROMPTS, merged).catch(() => {});
  return merged;
}


/** Pack 2 (Oct 19, 2026): more looks to play with — catalog, scenes, campaigns, and Oryza's house style. */
export const STYLE_PACK_PROMPTS: MasterPrompt[] = [
  // Catalog — same shot for every item
  { id: 'mp2_cat_flash_concrete', name: 'Каталог: вспышка на бетоне', prompt: 'Product on raw grey concrete floor against a matte grey wall, direct on-camera flash, hard crisp shadow straight behind, eye level, product centred filling 65% of the frame, slightly cool neutral colour, sharp edge to edge.', tags: ['каталог', 'вспышка', 'бетон'], createdAt: 1700000200000 },
  { id: 'mp2_cat_black_void', name: 'Каталог: чёрная пустота', prompt: 'Product floating-still on pure black seamless background, one narrow strip softbox from the left drawing a clean rim highlight, deep shadows, no reflections on the floor, centred, premium and quiet.', tags: ['каталог', 'чёрный фон', 'премиум'], createdAt: 1700000201000 },
  { id: 'mp2_cat_topdown_flash', name: 'Каталог: сверху со вспышкой', prompt: 'Strict top-down view (90 degrees), product centred on a single flat colour surface, hard flash from above-left, short sharp shadow to the lower right, nothing else in frame, magazine flat-lay precision.', tags: ['каталог', 'сверху', 'вспышка'], createdAt: 1700000202000 },
  { id: 'mp2_cat_colour_paper', name: 'Каталог: цветная бумага', prompt: 'Product on a seamless coloured paper sweep in one saturated colour taken from the product itself, soft frontal light, gentle gradient to the top, product centred, playful but clean.', tags: ['каталог', 'цвет', 'бумага'], createdAt: 1700000203000 },
  { id: 'mp2_cat_hard_sun', name: 'Каталог: жёсткое солнце', prompt: 'Product on a light stone surface in hard late-afternoon sun, long graphic shadow across the frame, a few leaf shadows on the wall behind, warm but clean colour, eye level.', tags: ['каталог', 'солнце', 'тени'], createdAt: 1700000204000 },
  // Scenes
  { id: 'mp2_scene_steel', name: 'Сцена: нержавейка и холод', prompt: 'Product on brushed stainless steel counter, cold fluorescent top light, subtle reflections, industrial kitchen behind out of focus, clinical and sharp, slight green-blue cast.', tags: ['сцена', 'металл', 'индастриал'], createdAt: 1700000210000 },
  { id: 'mp2_scene_night_neon', name: 'Сцена: ночь и неон', prompt: 'Product on a wet dark street surface at night, coloured neon signs blurred in the background, reflections in puddles, cinematic 35mm look, high contrast, slight grain.', tags: ['сцена', 'ночь', 'неон'], createdAt: 1700000211000 },
  { id: 'mp2_scene_konbini', name: 'Сцена: ночной магазинчик', prompt: 'Product on the counter of a small Asian convenience store at night, bright cool shelf lighting, colourful packaging softly out of focus behind, candid snapshot feel, direct flash.', tags: ['сцена', 'Азия', 'вспышка'], createdAt: 1700000212000 },
  { id: 'mp2_scene_brutalist', name: 'Сцена: брутализм', prompt: 'Product placed on a massive concrete block in a brutalist architectural space, strong geometric shadows, overcast daylight, wide composition with lots of negative space, monochrome palette with the product as the only colour.', tags: ['сцена', 'архитектура', 'бетон'], createdAt: 1700000213000 },
  // Campaign / editorial
  { id: 'mp2_camp_y2k_flash', name: 'Кампейн: Y2K вспышка', prompt: 'Editorial party snapshot: product held in a hand with chipped silver nail polish, harsh direct flash, dark background, slight motion blur, early-2000s digicam colour, playful and raw.', tags: ['кампейн', 'руки', 'вспышка'], createdAt: 1700000220000 },
  { id: 'mp2_camp_levitate', name: 'Кампейн: левитация', prompt: 'Product levitating mid-air with a slight tilt, crisp shadow on the floor below, clean coloured studio set, a few ingredients or elements of the product frozen in the air around it, high-speed sharpness.', tags: ['кампейн', 'левитация'], createdAt: 1700000221000 },
  { id: 'mp2_camp_macro', name: 'Кампейн: макро фактура', prompt: 'Extreme macro of the product surface and material, shallow depth of field, single raking light revealing texture, abstract and tactile, the product still recognisable at the edge of the frame.', tags: ['кампейн', 'макро', 'фактура'], createdAt: 1700000222000 },
  { id: 'mp2_camp_cinematic_dusk', name: 'Кампейн: киношные сумерки', prompt: 'Product in a real place at blue hour, warm practical lamp light on the product against cool ambient sky, anamorphic cinematic framing 2.39:1 feel, soft haze, shallow depth of field.', tags: ['кампейн', 'кино', 'сумерки'], createdAt: 1700000223000 },
  { id: 'mp2_camp_hands_diverse', name: 'Кампейн: в руке (разные руки)', prompt: 'Product held naturally in one hand, everyday gesture, the hand differs from shot to shot (skin tone, age, rings, nails), neutral background, soft window light, product label facing the camera and unchanged.', tags: ['кампейн', 'руки', 'лайфстайл'], createdAt: 1700000224000 },
  // Oryza house style (taken from their own menu photos)
  { id: 'mp2_oryza_table', name: 'Oryza: стол и стена (напитки)', prompt: "Oryza house style: the drink or product stands on Oryza's oval walnut tray with the engraved 'oryza' logo, on a dark walnut table against a plain warm-white wall. Camera at table height, straight horizon, tray fully in frame and centred, soft even daylight from the left, neutral white balance, no clutter. Keep the drink, glass, garnish and any label exactly as in the source photo.", tags: ['oryza', 'каталог', 'напитки'], createdAt: 1700000230000 },
  { id: 'mp2_oryza_topdown', name: 'Oryza: еда сверху', prompt: "Oryza house style for food: strict top-down view of the same plate on a dark walnut table, plate centred with even margin, soft diffused daylight, true colours of the food, no extra props. The dish, portion, ingredients and plate must stay exactly as in the source photo.", tags: ['oryza', 'каталог', 'еда'], createdAt: 1700000231000 },
  { id: 'mp2_oryza_restage', name: 'Oryza: перенести в фирменный стиль', prompt: "Re-stage this exact item into Oryza's house style: dark walnut table, plain warm-white wall, oval walnut tray with the 'oryza' logo for drinks, camera at table height, soft even daylight. Do not change the item itself: same glass or plate, same contents, colours, garnish and portion.", tags: ['oryza', 'перенос стиля'], createdAt: 1700000232000 },
];

const STYLE_PACK_FLAG = 'aips_style_pack_v2';

/** Adds pack-2 prompts once to libraries saved before they existed. */
function withStylePack(prompts: MasterPrompt[]): MasterPrompt[] {
  try {
    if (localStorage.getItem(STYLE_PACK_FLAG)) return prompts;
    localStorage.setItem(STYLE_PACK_FLAG, '1');
  } catch {
    return prompts;
  }
  const missing = STYLE_PACK_PROMPTS.filter((sp) => !prompts.some((p) => p.id === sp.id));
  if (missing.length === 0) return prompts;
  const merged = [...prompts, ...missing];
  idbSet(STORAGE_KEY_MASTER_PROMPTS, merged).catch(() => {});
  return merged;
}

export const DEFAULT_MASTER_PROMPTS: MasterPrompt[] = [
  ...SOURCE_FIX_PROMPTS,
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
  ...STYLE_PACK_PROMPTS,
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

/**
 * Saves the project as JSON. Master prompts live outside projects (one library per
 * browser), so they are written into the file too; import merges them back.
 */
export function exportProjectToJson(project: Project, masterPrompts: MasterPrompt[] = []): void {
  const payload = { ...project, masterPrompts, exportedAt: Date.now(), format: 'aips-project-v2' };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', url);
  const cleanName = project.name.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase() || 'project';
  downloadAnchor.setAttribute('download', `${cleanName}_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Adds prompts from an imported file that this browser doesn't have yet (same id or same text = same prompt). */
export function mergeMasterPrompts(current: MasterPrompt[], incoming: unknown): { merged: MasterPrompt[]; added: number } {
  if (!Array.isArray(incoming)) return { merged: current, added: 0 };
  const valid = incoming.filter(
    (p): p is MasterPrompt => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.prompt === 'string'
  );
  const missing = valid.filter((p) => !current.some((c) => c.id === p.id || c.prompt.trim() === p.prompt.trim()));
  return { merged: [...current, ...missing], added: missing.length };
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
      const merged = withStylePack(withSourceFixPrompts(fromIdb));
      inMemoryMasterPromptsCache = merged;
      return merged;
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
