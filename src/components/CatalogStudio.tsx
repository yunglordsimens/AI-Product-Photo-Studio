import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, ProductItem, MasterPrompt } from '../types';
import { compressDataUrl } from '../utils/imageUtils';
import { getImageModel, hasGenerationAccess } from '../utils/gemini';
import {
  ASPECT_RATIOS,
  CATEGORY_CHECKS,
  CATEGORY_LABELS,
  CatalogCategory,
  CatalogItem,
  CatalogResult,
  CatalogState,
  CatalogVersion,
  DEFAULT_RECIPES,
  describeRecipeFromRefs,
  editCatalogShot,
  emptyCatalogState,
  fileBaseName,
  generateCatalogShot,
  keepWithLast,
  sourceLabels,
  takeNums,
  loadCatalogState,
  newId,
  saveCatalogState,
  slugify,
  withRetry,
} from '../utils/catalog';
import { buildZip, dataUrlToBytes, downloadBlob } from '../utils/zip';
import { groupPrompts } from '../utils/promptCategories';
import { fileSafe } from '../utils/positionsExport';
import { isImageFile, normalizeImageFiles } from '../utils/heic';
import { SOURCE_FIX_MARKER } from '../utils/storage';
import { renderBeforeAfter } from '../utils/beforeAfter';
import { isGenericName, normName } from '../utils/positionsImport';
import { makeExample, withExample } from '../utils/promptExamples';
import { Info } from './Info';

interface CatalogStudioProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  products: ProductItem[];
  selectedCards: Card[];
  /** All photos on the board, to pick style references from */
  boardCards?: Card[];
  masterPrompts?: MasterPrompt[];
  onSaveMasterPrompts?: (prompts: MasterPrompt[]) => void;
  onOpenSettings: () => void;
  /** Photos sent from the board («в каталог»); a new `key` adds them once */
  incomingItems?: { key: number; items: { name: string; src: string }[] } | null;
  /** Reports a run in progress (null when idle), so the tab can show it while you are elsewhere */
  onProgress?: (p: { done: number; total: number } | null) => void;
}

const CONCURRENCY = 2;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/** Loads and downscales an image file; returns null for formats the browser cannot decode (e.g. HEIC). */
async function prepareImage(file: File, maxSide: number, quality: number): Promise<string | null> {
  const raw = await readFileAsDataUrl(file);
  const out = await compressDataUrl(raw, maxSide, maxSide, quality);
  return out.startsWith('data:image/jpeg') ? out : null;
}

const naturalSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export const CatalogStudio: React.FC<CatalogStudioProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  products,
  selectedCards,
  boardCards = [],
  masterPrompts = [],
  incomingItems,
  onProgress,
  onSaveMasterPrompts,
  onOpenSettings,
}) => {
  // Picking style references from the board or from positions
  const [refPicker, setRefPicker] = useState<null | 'board' | 'products'>(null);
  const [catalog, setCatalog] = useState<CatalogState>(emptyCatalogState());
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [isDescribing, setIsDescribing] = useState(false);
  const [compareId, setCompareIdState] = useState<string | null>(null);
  // Position in the "после" stack (0 = current take) and in the "до" stack (0 = current source)
  const [afterIdx, setAfterIdx] = useState(0);
  const wheelAcc = useRef(0);
  const [beforeIdx, setBeforeIdx] = useState(0);
  const [editText, setEditText] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isMakingCards, setIsMakingCards] = useState(false);
  /** Which half the ↑ ↓ keys flip; set by clicking a half */
  const [activeSide, setActiveSide] = useState<'before' | 'after'>('after');
  /** «рядом»: two halves; «шторка»: one frame with a divider, like Lightroom */
  const [compareMode, setCompareMode] = useState<'side' | 'slider'>(() => {
    try {
      return localStorage.getItem('aips_compare_mode') === 'slider' ? 'slider' : 'side';
    } catch {
      return 'side';
    }
  });
  const [split, setSplit] = useState(50);
  const setCompareId = (id: string | null) => {
    setCompareIdState(id);
    setAfterIdx(0);
    setBeforeIdx(0);
  };
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [refMenuOpen, setRefMenuOpen] = useState(false);
  const [sampleMenuOpen, setSampleMenuOpen] = useState(false);
  const [samplePicker, setSamplePicker] = useState<null | 'board' | 'products'>(null);
  const sampleInputRef = useRef<HTMLInputElement>(null);
  const [itemsFromBoard, setItemsFromBoard] = useState(false);

  const stopRef = useRef(false);
  useEffect(() => {
    onProgress?.(isRunning ? progress : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, progress]);
  const refInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Load per-project catalog
  useEffect(() => {
    if (loadedFor === projectId) return;
    let alive = true;
    loadCatalogState(projectId).then((state) => {
      if (!alive) return;
      // Results interrupted by a reload are no longer running.
      state.items = state.items.map((it) => ({
        ...it,
        results: Object.fromEntries(
          Object.entries(it.results).map(([k, r]) => [
            k,
            r.status === 'running' ? { ...r, status: 'error' as const, error: 'Прервано' } : r,
          ])
        ),
      }));
      setCatalog(state);
      setSelectedIds(new Set());
      setLoadedFor(projectId);
    });
    return () => {
      alive = false;
    };
  }, [projectId, loadedFor]);

  // Persist (debounced)
  useEffect(() => {
    if (loadedFor !== projectId) return;
    const t = setTimeout(() => {
      saveCatalogState(projectId, catalog).then((ok) => {
        if (!ok) setNotice({ kind: 'error', text: 'Не удалось сохранить каталог в браузере (мало места?)' });
      });
    }, 400);
    return () => clearTimeout(t);
  }, [catalog, projectId, loadedFor]);

  const activeVersion = useMemo(
    () => catalog.versions.find((v) => v.id === catalog.activeVersionId) || null,
    [catalog.versions, catalog.activeVersionId]
  );

  const currentSettings = useMemo(
    () => ({
      recipe: catalog.recipe,
      category: catalog.category,
      aspectRatio: catalog.aspectRatio,
      temperature: catalog.temperature,
      refIds: catalog.refs.map((r) => r.id),
      model: getImageModel(),
    }),
    [catalog.recipe, catalog.category, catalog.aspectRatio, catalog.temperature, catalog.refs]
  );


  const update = useCallback((fn: (prev: CatalogState) => CatalogState) => setCatalog(fn), []);

  const setResult = useCallback(
    (itemId: string, versionId: string, patch: Partial<CatalogResult>) => {
      update((prev) => ({
        ...prev,
        items: prev.items.map((it) =>
          it.id !== itemId
            ? it
            : {
                ...it,
                results: {
                  ...it.results,
                  [versionId]: {
                    ...(it.results[versionId] || { status: 'running' }),
                    ...patch,
                    updatedAt: Date.now(),
                  } as CatalogResult,
                },
              }
        ),
      }));
    },
    [update]
  );

  // ---------- Inputs ----------

  const addReferenceFiles = async (files: File[]) => {
    const room = 3 - catalog.refs.length;
    if (room <= 0) {
      setNotice({ kind: 'info', text: 'Эталонов максимум 3. Удали один, чтобы добавить новый.' });
      return;
    }
    const added: CatalogState['refs'] = [];
    let skipped = 0;
    for (const file of (await normalizeImageFiles(files)).slice(0, room)) {
      const src = await prepareImage(file, 1024, 0.88);
      if (src) added.push({ id: newId('ref'), name: file.name, src });
      else skipped++;
    }
    update((prev) => ({ ...prev, refs: [...prev.refs, ...added].slice(0, 3) }));
    if (skipped) setNotice({ kind: 'error', text: `${skipped} файл(ов) не открылось. HEIC сначала экспортируй в JPG.` });
  };

  const addReferencesFromSrcs = async (picked: { name: string; src: string }[]) => {
    const added: CatalogState['refs'] = [];
    for (const it of picked.slice(0, 3 - catalog.refs.length)) {
      const src = await compressDataUrl(it.src, 1024, 1024, 0.88);
      if (src.startsWith('data:image')) added.push({ id: newId('ref'), name: it.name, src });
    }
    update((prev) => ({ ...prev, refs: [...prev.refs, ...added].slice(0, 3) }));
  };

  const addReferencesFromCanvas = async () => {
    if (selectedCards.length === 0) {
      setNotice({ kind: 'info', text: 'Выдели 1–3 карточки на доске, потом нажми ещё раз.' });
      return;
    }
    const added: CatalogState['refs'] = [];
    for (const card of selectedCards.slice(0, 3 - catalog.refs.length)) {
      const src = await compressDataUrl(card.src, 1024, 1024, 0.88);
      if (src.startsWith('data:image')) added.push({ id: newId('ref'), name: card.name || 'с доски', src });
    }
    update((prev) => ({ ...prev, refs: [...prev.refs, ...added].slice(0, 3) }));
  };

  // ---------- «Одинаковое в серии» ----------
  const addSamples = async (picked: { name: string; src: string }[]) => {
    const room = 3 - (catalog.samples?.length || 0);
    const added: NonNullable<CatalogState['samples']> = [];
    for (const it of picked.slice(0, room)) {
      const src = await compressDataUrl(it.src, 1024, 1024, 0.88);
      if (src.startsWith('data:image')) added.push({ id: newId('smp'), name: it.name, src, role: '' });
    }
    update((prev) => ({ ...prev, samples: [...(prev.samples || []), ...added].slice(0, 3) }));
  };
  const addSampleFiles = async (files: File[]) => {
    const picked: { name: string; src: string }[] = [];
    for (const f of await normalizeImageFiles(files)) {
      const src = await prepareImage(f, 1024, 0.88);
      if (src) picked.push({ name: f.name, src });
    }
    addSamples(picked);
  };
  const setSampleRole = (id: string, role: string) =>
    update((prev) => ({ ...prev, samples: (prev.samples || []).map((sm) => (sm.id === id ? { ...sm, role } : sm)) }));
  const setItemSize = (id: string, size: number) =>
    update((prev) => ({ ...prev, items: prev.items.map((it) => (it.id === id ? { ...it, size } : it)) }));

  const addItemFiles = async (files: File[]) => {
    const images = (await normalizeImageFiles(files.filter((f) => isImageFile(f) || IMAGE_EXT.test(f.name)))).sort(
      (a, b) => naturalSort(a.name, b.name)
    );
    if (images.length === 0) {
      setNotice({ kind: 'info', text: 'В выбранном нет картинок.' });
      return;
    }
    setNotice({ kind: 'info', text: `Загружаю ${images.length} фото…` });
    const added: CatalogItem[] = [];
    let skipped = 0;
    for (const file of images) {
      const src = await prepareImage(file, 1536, 0.9);
      if (src) added.push({ id: newId('item'), name: fileBaseName(file.name), original: src, results: {} });
      else skipped++;
    }
    update((prev) => ({ ...prev, items: [...prev.items, ...added] }));
    setNotice(
      skipped
        ? { kind: 'error', text: `Добавлено ${added.length}. Не открылось ${skipped} (HEIC сначала экспортируй в JPG).` }
        : { kind: 'info', text: `Добавлено ${added.length} фото.` }
    );
  };

  const addItemsFromSrcs = async (picked: { id?: string; name: string; src: string }[]) => {
    const added: CatalogItem[] = [];
    for (const it of picked) {
      const src = await compressDataUrl(it.src, 1536, 1536, 0.9);
      if (src.startsWith('data:image')) added.push({ id: newId('item'), name: it.name || 'фото', original: src, results: {}, sourceId: it.id });
    }
    update((prev) => ({ ...prev, items: [...prev.items, ...added] }));
    setNotice({ kind: 'info', text: `Добавлено ${added.length} фото.` });
  };

  /** Which of these sources are already in the catalog (same position / photo, or the same name) */
  const alreadyInCatalog = (list: { id: string; name: string }[]) => {
    const ids = new Set(catalog.items.map((i) => i.sourceId).filter(Boolean) as string[]);
    const names = new Set(catalog.items.map((i) => normName(i.name)));
    return new Set(list.filter((x) => ids.has(x.id) || (x.name && names.has(normName(x.name)))).map((x) => x.id));
  };

  // ---------- Duplicates ----------
  const [showDuplicates, setShowDuplicates] = useState(false);
  const duplicateGroups = useMemo(() => {
    // same source, the very same photo, or the same (meaningful) name → one group
    const parent = catalog.items.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const byKey = new Map<string, number>();
    catalog.items.forEach((it, i) => {
      const keys = [
        it.sourceId ? `s:${it.sourceId}` : '',
        `p:${it.original.length}:${it.original.slice(-64)}`,
        isGenericName(it.name) ? '' : `n:${normName(it.name)}`,
      ].filter(Boolean);
      keys.forEach((k) => {
        const j = byKey.get(k);
        if (j === undefined) byKey.set(k, i);
        else parent[find(i)] = find(j);
      });
    });
    const groups = new Map<number, CatalogItem[]>();
    catalog.items.forEach((it, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(it);
    });
    return [...groups.values()].filter((g) => g.length > 1);
  }, [catalog.items]);

  // Photos sent from the board arrive once the catalog of this project is loaded
  const handledIncoming = useRef<number | null>(null);
  useEffect(() => {
    if (!incomingItems || loadedFor !== projectId || handledIncoming.current === incomingItems.key) return;
    handledIncoming.current = incomingItems.key;
    addItemsFromSrcs(incomingItems.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingItems, loadedFor, projectId]);


  // ---------- Recipe ----------

  const describeStyle = async () => {
    if (!hasGenerationAccess()) return onOpenSettings();
    setIsDescribing(true);
    setNotice(null);
    try {
      const recipe = await withRetry(() => describeRecipeFromRefs(catalog.refs, catalog.category));
      update((prev) => ({ ...prev, recipe }));
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsDescribing(false);
    }
  };

  const changeCategory = (category: CatalogCategory) => {
    update((prev) => {
      const isDefault = Object.values(DEFAULT_RECIPES).includes(prev.recipe.trim());
      return { ...prev, category, recipe: isDefault || !prev.recipe.trim() ? DEFAULT_RECIPES[category] : prev.recipe };
    });
  };

  // ---------- Run ----------

  /** Versions are made by hand only; a run uses the current settings inside the active version */
  const ensureVersion = (): CatalogVersion => {
    if (activeVersion) {
      const refreshed: CatalogVersion = { ...activeVersion, ...currentSettings };
      update((prev) => ({ ...prev, versions: prev.versions.map((v) => (v.id === refreshed.id ? refreshed : v)) }));
      return refreshed;
    }
    const version: CatalogVersion = { id: newId('ver'), label: 'v1', ...currentSettings, createdAt: Date.now() };
    update((prev) => ({ ...prev, versions: [...prev.versions, version], activeVersionId: version.id }));
    return version;
  };

  /** «новая версия»: something quite new; the old one stays and can be opened again */
  const newVersion = () => {
    const version: CatalogVersion = { id: newId('ver'), label: `v${catalog.versions.length + 1}`, ...currentSettings, createdAt: Date.now() };
    update((prev) => ({ ...prev, versions: [...prev.versions, version], activeVersionId: version.id }));
  };

  /** «1» for v1: the number used in take labels (1.1, 1.2…) */
  const versionNo = (versionId?: string) => {
    const i = catalog.versions.findIndex((v) => v.id === versionId);
    return i >= 0 ? i + 1 : 1;
  };

  // A new take goes on top; the previous one stays in the item's history (newest first)
  const pushTake = useCallback(
    (itemId: string, versionId: string, src: string) => {
      update((prev) => ({
        ...prev,
        items: prev.items.map((it) => {
          if (it.id !== itemId) return it;
          const old = it.results[versionId];
          const oldNums = takeNums(old);
          const seq = Math.max(old?.seq || 0, ...oldNums, 0) + 1;
          const history = old?.src ? [old.src, ...(old.history || [])].slice(0, 12) : old?.history || [];
          const nums = [seq, ...(old?.src ? oldNums : oldNums.slice(1))].slice(0, history.length + 1);
          return {
            ...it,
            results: {
              ...it.results,
              [versionId]: { ...old, src, history, nums, seq, status: 'done', error: undefined, approved: false, updatedAt: Date.now() },
            },
          };
        }),
      }));
    },
    [update]
  );

  /** `fresh` lets a caller pass items it has just changed (e.g. a new source) before state catches up */
  const run = async (itemIds: string[], fresh?: CatalogItem[]) => {
    if (isRunning || itemIds.length === 0) return;
    if (!hasGenerationAccess()) return onOpenSettings();
    if (catalog.refs.length === 0) {
      setNotice({ kind: 'info', text: 'Сначала добавь хотя бы один эталонный кадр (шаг 1).' });
      return;
    }
    if (!catalog.recipe.trim()) {
      setNotice({ kind: 'info', text: 'Рецепт пустой. Нажми «Описать стиль» или выбери тип.' });
      return;
    }

    const version = ensureVersion();
    const refs = catalog.refs;
    const samples = catalog.samples || [];
    // the first ★ photo of another item keeps scale and framing the same across the series
    const approvedOf = (itemId: string) => {
      if (!catalog.matchApproved) return undefined;
      const other = catalog.items.find((it) => it.id !== itemId && it.results[version.id]?.approved && it.results[version.id]?.src);
      return other?.results[version.id]?.src;
    };
    const items = (fresh || catalog.items).filter((it) => itemIds.includes(it.id));
    const queue = [...items];

    stopRef.current = false;
    setIsRunning(true);
    setNotice(null);
    setProgress({ done: 0, total: items.length });
    items.forEach((it) => setResult(it.id, version.id, { status: 'running', error: undefined }));

    let failed = 0;
    const worker = async () => {
      while (queue.length > 0 && !stopRef.current) {
        const item = queue.shift()!;
        try {
          const src = await withRetry(() => generateCatalogShot(item, version, refs, { samples, approvedShot: approvedOf(item.id) }));
          pushTake(item.id, version.id, src);
        } catch (err) {
          failed++;
          const message = err instanceof Error ? err.message : String(err);
          setResult(item.id, version.id, { status: 'error', error: message });
          if ((err as { status?: number })?.status === 401) stopRef.current = true;
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));

    // Anything still queued after a stop goes back to "not run".
    if (queue.length > 0) {
      const leftover = new Set(queue.map((q) => q.id));
      update((prev) => ({
        ...prev,
        items: prev.items.map((it) => {
          if (!leftover.has(it.id)) return it;
          const results = { ...it.results };
          const r = results[version.id];
          if (r?.src) results[version.id] = { ...r, status: 'done' };
          else delete results[version.id];
          return { ...it, results };
        }),
      }));
    }

    setIsRunning(false);
    if (failed) setNotice({ kind: 'error', text: `Ошибок: ${failed}. Их можно перезапустить кнопкой «Повторить ошибки».` });
  };

  const stop = () => {
    stopRef.current = true;
  };

  // ---------- Results ----------

  const resultOf = (item: CatalogItem): CatalogResult | undefined =>
    activeVersion ? item.results[activeVersion.id] : undefined;

  const stats = useMemo(() => {
    let done = 0;
    let errors = 0;
    let approved = 0;
    for (const it of catalog.items) {
      const r = activeVersion ? it.results[activeVersion.id] : undefined;
      if (r?.status === 'done') done++;
      if (r?.status === 'error') errors++;
      if (r?.approved) approved++;
    }
    return { done, errors, approved };
  }, [catalog.items, activeVersion]);

  const toggleApprove = (itemId: string) => {
    if (!activeVersion) return;
    const it = catalog.items.find((i) => i.id === itemId);
    const r = it?.results[activeVersion.id];
    if (!r || r.status !== 'done') return;
    setResult(itemId, activeVersion.id, { approved: !r.approved });
  };

  const removeItem = (itemId: string) => {
    update((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== itemId) }));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  };

  const renameItem = (itemId: string, name: string) =>
    update((prev) => ({ ...prev, items: prev.items.map((i) => (i.id === itemId ? { ...i, name } : i)) }));

  const exportZip = () => {
    if (!activeVersion) return;
    const done = catalog.items
      .map((it) => ({ it, r: it.results[activeVersion.id] }))
      .filter((x) => x.r?.status === 'done' && x.r.src);
    const picked = done.some((x) => x.r!.approved) ? done.filter((x) => x.r!.approved) : done;
    if (picked.length === 0) {
      setNotice({ kind: 'info', text: 'В этой версии ещё нет готовых фото.' });
      return;
    }
    // Files are named exactly like the positions (diacritics and spaces kept), so they can be swapped in by name
    const used = new Map<string, number>();
    const entries = picked.map(({ it, r }) => {
      const { bytes, ext } = dataUrlToBytes(r!.src!);
      const base = fileSafe(it.name);
      const n = (used.get(base.toLowerCase()) || 0) + 1;
      used.set(base.toLowerCase(), n);
      return { name: `${n > 1 ? `${base} ${n}` : base}.${ext}`, data: bytes };
    });
    downloadBlob(buildZip(entries), `${slugify(projectName)}-catalog-${activeVersion.label}.zip`);
  };

  const applyVersionSettings = (v: CatalogVersion) => {
    update((prev) => ({
      ...prev,
      recipe: v.recipe,
      category: v.category,
      aspectRatio: v.aspectRatio,
      temperature: v.temperature,
      activeVersionId: v.id,
    }));
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---------- Stacks in the compare view ----------
  const afterStack = (it: CatalogItem): string[] => {
    const r = activeVersion ? it.results[activeVersion.id] : undefined;
    return [r?.src, ...(r?.history || [])].filter((x): x is string => Boolean(x));
  };
  const beforeStack = (it: CatalogItem): string[] => [it.original, ...(it.originalHistory || [])];

  /** ★ the take being shown: it becomes the current one (the others stay in the stack) */
  const chooseTake = (itemId: string, idx: number) => {
    if (!activeVersion) return;
    update((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.id !== itemId) return it;
        const r = it.results[activeVersion.id];
        if (!r?.src) return it;
        const stack = [r.src, ...(r.history || [])];
        const nums = takeNums(r);
        const chosen = stack[idx];
        if (!chosen) return it;
        const rest = stack.filter((_, i) => i !== idx);
        const restNums = nums.filter((_, i) => i !== idx);
        const approved = idx === 0 ? !r.approved : true;
        return {
          ...it,
          results: {
            ...it.results,
            [activeVersion.id]: { ...r, src: chosen, history: rest, nums: [nums[idx], ...restNums], approved, updatedAt: Date.now() },
          },
        };
      }),
    }));
    setAfterIdx(0);
  };

  /** Throw away the take being shown (the others stay) */
  const deleteTake = (itemId: string, idx: number) => {
    if (!activeVersion) return;
    update((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.id !== itemId) return it;
        const r = it.results[activeVersion.id];
        if (!r?.src) return it;
        const stack = [r.src, ...(r.history || [])];
        const nums = takeNums(r);
        const rest = stack.filter((_, i) => i !== idx);
        const restNums = nums.filter((_, i) => i !== idx);
        const results = { ...it.results };
        if (rest.length === 0) delete results[activeVersion.id];
        else
          results[activeVersion.id] = {
            ...r,
            src: rest[0],
            history: rest.slice(1),
            nums: restNums,
            approved: idx === 0 ? false : r.approved,
            updatedAt: Date.now(),
          };
        return { ...it, results };
      }),
    }));
    setAfterIdx((i) => Math.max(0, i - (idx <= i ? 1 : 0)));
  };

  /** «сделать мастером»: the take being shown becomes the source («до»), labelled with its number. Nothing runs by itself:
   * «обработать» makes the next take from it. The client's original always stays at the bottom of «до». */
  const promoteToSource = (itemId: string, idx: number) => {
    const it = catalog.items.find((i) => i.id === itemId);
    const src = it ? afterStack(it)[idx] : undefined;
    if (!it || !src) return;
    const label = takeLabel(it, idx);
    const updated: CatalogItem = {
      ...it,
      original: src,
      originalHistory: keepWithLast([it.original, ...(it.originalHistory || [])], 12),
      sourceLabels: keepWithLast([label, ...sourceLabels(it)], 13),
    };
    update((prev) => ({ ...prev, items: prev.items.map((x) => (x.id === itemId ? updated : x)) }));
    setBeforeIdx(0);
    setNotice({ kind: 'info', text: `${label} теперь мастер («до»). «Обработать» сделает из него новый дубль.` });
  };

  /** Label of a take in the active version: «1.3» */
  const takeLabel = (it: CatalogItem, idx: number) => {
    const r = activeVersion ? it.results[activeVersion.id] : undefined;
    const n = takeNums(r)[idx];
    return n ? `${versionNo(activeVersion?.id)}.${n}` : '—';
  };

  /** Go back to an earlier source */
  const restoreSource = (itemId: string, idx: number) => {
    update((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.id !== itemId) return it;
        const stack = [it.original, ...(it.originalHistory || [])];
        const labels = sourceLabels(it);
        const chosen = stack[idx];
        if (!chosen) return it;
        // the client's original stays at the bottom even when it is used again
        if (idx === stack.length - 1) {
          return { ...it, original: chosen, originalHistory: stack.slice(0, -1).concat(chosen), sourceLabels: [labels[idx], ...labels.slice(0, -1), labels[idx]].slice(0, stack.length + 1) };
        }
        return {
          ...it,
          original: chosen,
          originalHistory: stack.filter((_, i) => i !== idx),
          sourceLabels: [labels[idx], ...labels.filter((_, i) => i !== idx)],
        };
      }),
    }));
    setBeforeIdx(0);
  };

  /** Quick fixes = the «Исходник» master prompts, named without the shelf prefix */
  const quickEdits = useMemo(
    () => masterPrompts.filter((mp) => mp.prompt.includes(SOURCE_FIX_MARKER)).map((mp) => ({ ...mp, short: mp.name.replace(/^Исходник:\s*/i, '') })),
    [masterPrompts]
  );

  /** Edit the take being shown by words; the result goes on top of the «после» stack */
  const editTake = async (itemId: string, idx: number, instruction: string, promptId?: string) => {
    const text = instruction.trim();
    const it = catalog.items.find((i) => i.id === itemId);
    const src = it ? afterStack(it)[idx] : undefined;
    if (!it || !src || !text || !activeVersion || editingItemId) return;
    if (!hasGenerationAccess()) return onOpenSettings();
    setEditingItemId(itemId);
    setNotice(null);
    try {
      const out = await withRetry(() => editCatalogShot(src, text, activeVersion));
      // the edited take goes on top; the one it came from stays in the stack
      pushTake(itemId, activeVersion.id, out);
      setAfterIdx(0);
      setEditText('');
      // A quick action that has no example yet gets this one
      const mp = promptId ? masterPrompts.find((p) => p.id === promptId) : undefined;
      if (mp && !mp.example && onSaveMasterPrompts) {
        const ex = await makeExample(src, out, 'auto');
        onSaveMasterPrompts(withExample(masterPrompts, mp.id, ex));
      }
    } catch (err) {
      setNotice({ kind: 'error', text: `Правка не вышла: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setEditingItemId(null);
    }
  };

  /** A «до | после» picture for one item, to show a client or post */
  const downloadBeforeAfter = async (it: CatalogItem, beforeSrc: string, afterSrc: string) => {
    try {
      const blob = await renderBeforeAfter(beforeSrc, afterSrc, { title: it.name });
      downloadBlob(blob, `${fileSafe(it.name)} до-после.jpg`);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  /** «До | после» for every ★ item (or every ready one if nothing is starred), one ZIP */
  const exportBeforeAfterZip = async () => {
    if (!activeVersion) return;
    const done = catalog.items.filter((it) => it.results[activeVersion.id]?.status === 'done' && it.results[activeVersion.id]?.src);
    const picked = done.some((it) => it.results[activeVersion.id]!.approved) ? done.filter((it) => it.results[activeVersion.id]!.approved) : done;
    if (picked.length === 0) {
      setNotice({ kind: 'info', text: 'В этой версии ещё нет готовых фото.' });
      return;
    }
    setIsMakingCards(true);
    try {
      const used = new Map<string, number>();
      const entries: { name: string; data: Uint8Array }[] = [];
      for (const it of picked) {
        const blob = await renderBeforeAfter(it.original, it.results[activeVersion.id]!.src!, { title: it.name });
        const base = fileSafe(it.name);
        const n = (used.get(base.toLowerCase()) || 0) + 1;
        used.set(base.toLowerCase(), n);
        entries.push({ name: `${n > 1 ? `${base} ${n}` : base} до-после.jpg`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      downloadBlob(buildZip(entries), `${slugify(projectName)}-before-after-${activeVersion.label}.zip`);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsMakingCards(false);
    }
  };

  // Keyboard in compare view
  const compareIndex = compareId ? catalog.items.findIndex((i) => i.id === compareId) : -1;
  useEffect(() => {
    if (!compareId || !isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') setCompareId(null);
      if (e.key === 'ArrowRight' && compareIndex < catalog.items.length - 1) setCompareId(catalog.items[compareIndex + 1].id);
      if (e.key === 'ArrowLeft' && compareIndex > 0) setCompareId(catalog.items[compareIndex - 1].id);
      const it = catalog.items.find((i) => i.id === compareId);
      if (!it) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const side = e.shiftKey ? (activeSide === 'after' ? 'before' : 'after') : activeSide;
        if (side === 'before') setBeforeIdx((i) => Math.max(0, Math.min(beforeStack(it).length - 1, i + step)));
        else setAfterIdx((i) => Math.max(0, Math.min(afterStack(it).length - 1, i + step)));
      }
      if (e.key.toLowerCase() === 'a' || e.key === 'ф' || e.key === 'Ф') chooseTake(compareId, afterIdx);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareId, compareIndex, catalog.items, activeVersion, afterIdx, activeSide, isOpen]);

  if (!isOpen) return null;

  const errorIds = catalog.items.filter((it) => resultOf(it)?.status === 'error').map((it) => it.id);
  const pendingIds = catalog.items.filter((it) => !resultOf(it)?.src).map((it) => it.id);
  const selectedList = catalog.items.filter((it) => selectedIds.has(it.id)).map((it) => it.id);
  const firstForTest = selectedList[0] || catalog.items[0]?.id;
  const compareItem = compareIndex >= 0 ? catalog.items[compareIndex] : null;
  const compareResult = compareItem ? resultOf(compareItem) : undefined;
  const [arW, arH] = catalog.aspectRatio.split(':').map(Number);

  return (
    <div id="catalog-studio" className="absolute inset-0 z-30 bg-white text-[var(--fg)] flex flex-col select-none">
      {/* Head: running line like every part of the studio */}
      <header className="shrink-0 px-2 pt-2">
        <div className="ofst-run">
          <span>Каталог · {projectName}</span>
          <span className="hidden sm:inline">один эталон → одинаковые кадры для всех товаров</span>
          <button onClick={onClose} className="hover:text-[var(--fg)] cursor-pointer" aria-label="На доску">
            ← доска
          </button>
        </div>
      </header>

      {notice && (
        <div
          className={`mx-2 mt-1 px-2 py-1 text-[13px] flex items-center justify-between gap-3 ${
            notice.kind === 'error' ? 'bg-[var(--marker)]' : 'bg-[var(--soft)]'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="underline shrink-0" aria-label="Скрыть">
            ок
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-auto lg:overflow-hidden">
        {/* Left: setup */}
        <aside className="lg:w-[360px] shrink-0 lg:overflow-y-auto custom-scrollbar p-2 space-y-4">
          {/* Step 1 */}
          <section className="space-y-2">
            <StepTitle n={1} title="Эталон стиля" hint="1–3 кадра" />
            <div className="grid grid-cols-3 gap-0.5">
              {catalog.refs.map((ref) => (
                <div key={ref.id} className="relative aspect-square overflow-hidden bg-[var(--soft)] group">
                  <img src={ref.src} alt={ref.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => update((prev) => ({ ...prev, refs: prev.refs.filter((r) => r.id !== ref.id) }))}
                    className="absolute top-0 right-0 bg-white px-1 text-[11px] leading-4 hover:bg-[var(--marker)] hidden group-hover:block"
                    title="Убрать"
                    aria-label="Убрать эталон"
                  >
                    убрать
                  </button>
                </div>
              ))}
              {catalog.refs.length < 3 && (
                <button
                  onClick={() => setRefMenuOpen((v) => !v)}
                  className={`aspect-square text-[13px] ${refMenuOpen ? 'bg-[var(--fg)] text-white' : 'bg-[var(--soft)] hover:bg-[var(--soft-2)]'}`}
                >
                  + эталон
                </button>
              )}
            </div>
            {catalog.refs.length < 3 && refMenuOpen && (
              <SourceList
                onDone={() => setRefMenuOpen(false)}
                options={[
                  { label: 'с доски', note: `${boardCards.length} фото`, disabled: boardCards.length === 0, onClick: () => setRefPicker('board') },
                  ...(selectedCards.length > 0 ? [{ label: `выделенные на доске (${selectedCards.length})`, onClick: addReferencesFromCanvas }] : []),
                  { label: 'из позиций', note: `${products.filter((p) => p.photoDataUrl).length}`, disabled: !products.some((p) => p.photoDataUrl), onClick: () => setRefPicker('products') },
                  { label: 'с компьютера', onClick: () => refInputRef.current?.click() },
                ]}
              />
            )}

            {/* Series: what must look the same in every photo */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center gap-1.5 text-[12px]">
                <span>Одинаковое в серии</span>
                <Info>
                  Образцы того, что должно выглядеть одинаково на всех фото: тот же пауч, этикетка, логотип. Подпиши, что это («пауч белый
                  матовый», «логотип — бери отсюда, тут чётче»). Размер товара относительно других — в полном экране («размер в серии»).
                </Info>
              </div>
              {(catalog.samples || []).map((sm) => (
                <div key={sm.id} className="flex items-center gap-1">
                  <img src={sm.src} alt={sm.name} className="w-12 h-12 object-cover bg-[var(--soft)] shrink-0" />
                  <input
                    value={sm.role}
                    onChange={(e) => setSampleRole(sm.id, e.target.value)}
                    placeholder="что это: пауч, логотип, этикетка…"
                    className="flex-1 min-w-0 h-7 px-1 text-[12px] select-text"
                  />
                  <button
                    onClick={() => update((prev) => ({ ...prev, samples: (prev.samples || []).filter((x) => x.id !== sm.id) }))}
                    className="ofst-x"
                    aria-label="Убрать образец"
                  >
                    ×
                  </button>
                </div>
              ))}
              {(catalog.samples?.length || 0) < 3 && (
                <button onClick={() => setSampleMenuOpen((v) => !v)} className={`ofst-cell !h-7 -ml-2 ${sampleMenuOpen ? 'is-on' : ''}`}>
                  + образец
                </button>
              )}
              {sampleMenuOpen && (
                <SourceList
                  onDone={() => setSampleMenuOpen(false)}
                  options={[
                    { label: 'с доски', note: `${boardCards.length} фото`, disabled: boardCards.length === 0, onClick: () => setSamplePicker('board') },
                    ...(selectedCards.length > 0
                      ? [{ label: `выделенные на доске (${selectedCards.length})`, onClick: () => addSamples(selectedCards.map((c) => ({ name: c.name || 'образец', src: c.src }))) }]
                      : []),
                    { label: 'из позиций', disabled: !products.some((p) => p.photoDataUrl), onClick: () => setSamplePicker('products') },
                    { label: 'с компьютера', onClick: () => sampleInputRef.current?.click() },
                  ]}
                />
              )}
              <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(catalog.matchApproved)}
                  onChange={(e) => update((prev) => ({ ...prev, matchApproved: e.target.checked }))}
                />
                масштаб и кадр — как у первого ★ фото
              </label>
            </div>

            <div className="grid grid-cols-2 gap-0.5">
              <label className="block">
                <span className="block text-[12px] text-[var(--grey)]">Тип</span>
                <select
                  value={catalog.category}
                  onChange={(e) => changeCategory(e.target.value as CatalogCategory)}
                  className="w-full h-8 px-2 text-[13px]"
                >
                  {(Object.keys(CATEGORY_LABELS) as CatalogCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[12px] text-[var(--grey)]">Формат кадра</span>
                <select
                  value={catalog.aspectRatio}
                  onChange={(e) => update((prev) => ({ ...prev, aspectRatio: e.target.value }))}
                  className="w-full h-8 px-2 text-[13px]"
                >
                  {ASPECT_RATIOS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-[var(--grey)]">Рецепт кадра</span>
                <button
                  onClick={describeStyle}
                  disabled={isDescribing || catalog.refs.length === 0}
                  className="text-[12px] underline disabled:no-underline disabled:text-[var(--grey)]"
                  title="Модель сама вытащит ракурс, свет, фон из эталонов"
                >
                  {isDescribing ? 'Описываю…' : 'Описать по эталону'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-[12px] pb-0.5">
                <select
                  value=""
                  onChange={(e) => {
                    const mp = masterPrompts.find((x) => x.id === e.target.value);
                    if (mp) update((prev) => ({ ...prev, recipe: mp.prompt }));
                  }}
                  className="h-7 px-1 flex-1 min-w-0 text-[12px]"
                  title="Взять рецепт из мастер-промптов"
                >
                  <option value="">из мастер-промптов…</option>
                  {groupPrompts(masterPrompts, projectId).map((g) => (
                    <optgroup key={g.title} label={g.title}>
                      {g.items.map((mp) => (
                        <option key={mp.id} value={mp.id}>
                          {mp.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {onSaveMasterPrompts && (
                  <button
                    onClick={() => {
                      if (!catalog.recipe.trim()) return;
                      const mp: MasterPrompt = {
                        id: newId('mp'),
                        name: `Каталог · ${projectName} · ${new Date().toLocaleDateString('ru-RU')}`,
                        prompt: catalog.recipe,
                        category: 'Каталог',
                        projectId,
                        tags: ['каталог'],
                        createdAt: Date.now(),
                      };
                      onSaveMasterPrompts([mp, ...masterPrompts]);
                      setNotice({ kind: 'info', text: 'Рецепт сохранён в мастер-промпты (полка «Этот проект»).' });
                    }}
                    className="underline shrink-0"
                  >
                    сохранить как мастер-промпт
                  </button>
                )}
              </div>
              <textarea
                value={catalog.recipe}
                onChange={(e) => update((prev) => ({ ...prev, recipe: e.target.value }))}
                rows={7}
                className="w-full text-[12px] leading-snug p-2 select-text"
                spellCheck={false}
              />
            </div>

            <label className="block">
              <span className="flex justify-between text-[12px] text-[var(--grey)]">
                <span>Одинаковость кадров</span>
                <span className="tabular-nums">t {catalog.temperature.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0.1}
                max={0.7}
                step={0.05}
                value={catalog.temperature}
                onChange={(e) => update((prev) => ({ ...prev, temperature: Number(e.target.value) }))}
                className="w-full accent-black"
              />
              <span className="flex justify-between text-[11px] text-[var(--grey)]">
                <span>строже</span>
                <span>свободнее</span>
              </span>
            </label>
          </section>

          {/* Step 2 */}
          <section className="space-y-1">
            <StepTitle n={2} title="Фото товаров" hint={`${catalog.items.length} фото${selectedList.length > 0 ? ` · выбрано ${selectedList.length}` : ''}`} />
            <SourceMenu
              label="+ фото товаров"
              options={[
                { label: 'с доски', note: `${boardCards.length} фото`, disabled: boardCards.length === 0, onClick: () => setItemsFromBoard(true) },
                ...(selectedCards.length > 0
                  ? [{ label: `выделенные на доске (${selectedCards.length})`, onClick: () => addItemsFromSrcs(selectedCards.map((c) => ({ name: c.name || 'фото', src: c.src }))) }]
                  : []),
                { label: 'из позиций', note: `${products.filter((p) => p.photoDataUrl).length}`, disabled: !products.some((p) => p.photoDataUrl), onClick: () => setShowProductPicker(true) },
                { label: 'с компьютера: фото', onClick: () => filesInputRef.current?.click() },
                { label: 'с компьютера: папка', onClick: () => folderInputRef.current?.click() },
              ]}
            />
            <p className="text-[12px] text-[var(--grey)]">Название берётся из имени файла, позиции или подписи на доске. С доски можно и так: выдели фото → «в каталог».</p>
          </section>

          {/* Step 3 */}
          <section className="space-y-1">
            <StepTitle n={3} title="Прогон" hint="сначала тест на одном" />
            {/* Versions: one by default; a new one only by hand, for something quite different */}
            <div className="flex items-center flex-wrap gap-1 text-[12px]">
              <span className="text-[var(--grey)]">версия</span>
              {catalog.versions.length <= 1 ? (
                <span className="tabular-nums">{versionNo(activeVersion?.id)}</span>
              ) : (
                <select
                  value={catalog.activeVersionId}
                  onChange={(e) => {
                    const v = catalog.versions.find((x) => x.id === e.target.value);
                    if (v) applyVersionSettings(v);
                  }}
                  className="h-6 px-1 text-[12px]"
                >
                  {catalog.versions.map((v, i) => (
                    <option key={v.id} value={v.id}>
                      {i + 1} · {CATEGORY_LABELS[v.category]} · {v.aspectRatio}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => {
                  if (window.confirm('Новая версия — для чего-то совсем другого. Текущие кадры останутся в своей версии. Создать?')) newVersion();
                }}
                disabled={isRunning || catalog.versions.length === 0}
                className="underline text-[var(--grey)] hover:text-[var(--fg)] disabled:opacity-40"
              >
                + новая версия
              </button>
              <Info>
                Все прогоны идут в одну версию: каждый новый кадр — дубль 1.1, 1.2, 1.3… и ничего не пропадает. Новую версию (2.1, 2.2…)
                делай только если хочешь что-то совсем другое; старая остаётся и открывается в этом же списке.
              </Info>
            </div>
            {isRunning ? (
              <div>
                <div className="h-1 bg-[var(--soft)]">
                  <div
                    className="h-full bg-[var(--fg)] transition-all"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[12px] pt-1">
                  <span className="tabular-nums">
                    {progress.done} из {progress.total}
                  </span>
                  <button onClick={stop} className="ofst-cell">
                    Стоп
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-stretch gap-0.5">
                <button
                  onClick={() => firstForTest && run([firstForTest])}
                  disabled={!firstForTest}
                  className="ofst-cell !h-9 bg-[var(--soft)]"
                >
                  Тест на одном фото
                </button>
                <button
                  onClick={() => run(selectedList.length ? selectedList : pendingIds)}
                  disabled={catalog.items.length === 0 || (selectedList.length === 0 && pendingIds.length === 0)}
                  className="ofst-cell ofst-cell--primary !h-9"
                >
                  {selectedList.length ? `Прогнать выбранные (${selectedList.length})` : `Прогнать новые (${pendingIds.length})`}
                </button>
                {errorIds.length > 0 && (
                  <button onClick={() => run(errorIds)} className="ofst-cell !h-9 bg-[var(--marker)]">
                    Повторить ошибки ({errorIds.length})
                  </button>
                )}
              </div>
            )}
            <p className="text-[11px] text-[var(--grey)] leading-snug">
              Каждое фото — один платный запрос к {getImageModel()}. Модель меняется в настройках.
            </p>
          </section>
        </aside>

        {/* Right: results */}
        <main className="flex-1 min-w-0 flex flex-col lg:overflow-hidden p-2 lg:pl-0">
          <div className="shrink-0 flex flex-wrap items-center justify-between">
            <div className="flex items-center flex-wrap">
              {!activeVersion ? (
                <span className="text-[13px] text-[var(--grey)]">Ещё не прогоняли: начни с теста на одном фото.</span>
              ) : (
                <span className="text-[12px] text-[var(--grey)] tabular-nums">
                  готово {stats.done}/{catalog.items.length}
                  {stats.approved > 0 && <> · одобрено {stats.approved}</>}
                  {stats.errors > 0 && <span className="text-[var(--fg)] bg-[var(--marker)] px-0.5"> · ошибок {stats.errors}</span>}
                </span>
              )}
            </div>
            <div className="flex items-center">
              {catalog.items.length > 0 && (
                <button
                  onClick={() =>
                    setSelectedIds((prev) =>
                      prev.size === catalog.items.length ? new Set() : new Set(catalog.items.map((i) => i.id))
                    )
                  }
                  className="ofst-cell ofst-cell--muted"
                >
                  {selectedIds.size === catalog.items.length ? 'Снять выбор' : 'Выбрать все'}
                </button>
              )}
              {duplicateGroups.length > 0 && (
                <button onClick={() => setShowDuplicates(true)} className="ofst-cell bg-[var(--marker)]" title="Одинаковые фото или названия">
                  дубликаты ({duplicateGroups.reduce((n, g) => n + g.length - 1, 0)})
                </button>
              )}
              {selectedIds.size > 0 && (
                <button
                  onClick={() => {
                    if (!window.confirm(`Убрать из каталога выбранные (${selectedIds.size})?`)) return;
                    update((prev) => ({ ...prev, items: prev.items.filter((i) => !selectedIds.has(i.id)) }));
                    setSelectedIds(new Set());
                  }}
                  disabled={isRunning}
                  className="ofst-cell hover:!bg-[var(--marker)]"
                >
                  Убрать выбранные ({selectedIds.size})
                </button>
              )}
              <button
                onClick={exportZip}
                disabled={!activeVersion || stats.done === 0}
                className="ofst-cell"
                title="Если есть одобренные — только они, иначе все готовые"
              >
                ZIP {stats.approved > 0 ? `(${stats.approved})` : ''}
              </button>
              <button
                onClick={exportBeforeAfterZip}
                disabled={!activeVersion || stats.done === 0 || isMakingCards}
                className="ofst-cell"
                title="Картинки «до | после» для ★ (или для всех готовых), одним ZIP"
              >
                {isMakingCards ? 'собираю…' : `до/после ${stats.approved > 0 ? `(${stats.approved})` : ''}`}
              </button>
            </div>
          </div>

          {activeVersion && (
            <p className="shrink-0 text-[12px] text-[var(--grey)] py-1">
              {CATEGORY_CHECKS[activeVersion.category]} Открой фото, чтобы сравнить крупно (← → листать, A — одобрить).
            </p>
          )}

          <div className="flex-1 lg:overflow-y-auto custom-scrollbar pt-1">
            {catalog.items.length === 0 ? (
              <div className="h-full min-h-[240px] bg-[var(--soft)] flex items-center justify-center text-center text-[var(--grey)] text-[13px]">
                Загрузи фото товаров (шаг 2)
              </div>
            ) : (
              <div className="grid gap-0 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {catalog.items.map((item, idx) => {
                  const r = resultOf(item);
                  const selected = selectedIds.has(item.id);
                  const takes = (r?.history?.length || 0) + (r?.src ? 1 : 0);
                  // Nothing in this version yet: show the latest take from another version, so the grid never goes blank
                  const otherVersion = !r?.src
                    ? catalog.versions
                        .map((v, vi) => ({ r: item.results[v.id], no: vi + 1 }))
                        .filter((x) => x.r?.src)
                        .pop()
                    : undefined;
                  const shownSrc = r?.src || otherVersion?.r?.src;
                  const shownLabel = r?.src ? takeLabel(item, 0) : otherVersion ? `${otherVersion.no}.${takeNums(otherVersion.r)[0] || 1}` : '';
                  return (
                    <div key={item.id} className="relative group/tile">
                      <div className="grid grid-cols-2 gap-0">
                        <Thumb src={item.original} label={sourceLabels(item)[0]} ratio={`${arW} / ${arH}`} onOpen={() => setCompareId(item.id)} />
                        <div className="relative bg-[var(--soft)]" style={{ aspectRatio: `${arW} / ${arH}` }}>
                          {shownSrc ? (
                            <div className={r?.src ? '' : 'opacity-50'}>
                              <Thumb src={shownSrc} label={shownLabel} ratio={`${arW} / ${arH}`} onOpen={() => setCompareId(item.id)} />
                            </div>
                          ) : null}
                          {r?.status === 'running' ? (
                            <div className="absolute inset-x-0 top-0 flex items-center justify-center text-[12px] bg-[var(--marker)] h-5">генерация…</div>
                          ) : shownSrc ? (
                            r?.status === 'error' ? (
                              <div className="absolute inset-x-0 top-0 px-1 text-[11px] bg-[var(--marker)] truncate select-text" title={r.error}>
                                ошибка: {r.error}
                              </div>
                            ) : null
                          ) : r?.status === 'error' ? (
                            <div className="absolute inset-0 p-1 bg-[var(--marker)] text-[11px] leading-snug line-clamp-6 select-text">{r.error}</div>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--grey)]">ещё не прогнано</div>
                          )}
                        </div>
                      </div>
                      {/* Caption lies on the photo; selection is the yellow marker, not a frame */}
                      <div
                        className={`absolute left-0 right-0 bottom-0 flex items-center gap-1 px-1 h-6 text-[12px] ${
                          selected ? 'bg-[var(--marker)]' : 'bg-white/85'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelect(item.id)}
                          className="shrink-0 w-3 h-3"
                          aria-label="Выбрать"
                        />
                        <span className="tabular-nums text-[var(--grey)] shrink-0">{String(idx + 1).padStart(2, '0')}</span>
                        <input
                          value={item.name}
                          onChange={(e) => renameItem(item.id, e.target.value)}
                          className="flex-1 min-w-0 !bg-transparent px-0 select-text"
                        />
                        {takes > 1 && (
                          <span className="text-[var(--grey)] shrink-0" title="Дублей в стопке «после»">
                            ×{takes}
                          </span>
                        )}
                        {r?.approved && <span className="shrink-0" title="Выбран">★</span>}
                        <span className="hidden group-hover/tile:flex shrink-0">
                          <IconBtn title="Новый дубль" onClick={() => run([item.id])} disabled={isRunning}>
                            ещё
                          </IconBtn>
                          <IconBtn title="Убрать из каталога" onClick={() => removeItem(item.id)} disabled={isRunning}>
                            убрать
                          </IconBtn>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Compare view: «до» and «после» side by side; each side is a stack to flip through (↑ ↓, Shift for «до») */}
      {compareItem && (() => {
        const after = afterStack(compareItem);
        const before = beforeStack(compareItem);
        const aIdx = Math.min(afterIdx, Math.max(0, after.length - 1));
        const bIdx = Math.min(beforeIdx, before.length - 1);
        const shownAfter = after[aIdx];
        const isRunningNow = compareResult?.status === 'running';
        // Wheel / two-finger swipe over a half flips its stack, one step per gesture
        const flipOnWheel = (total: number, set: React.Dispatch<React.SetStateAction<number>>) => (e: React.WheelEvent) => {
          wheelAcc.current += e.deltaY;
          if (Math.abs(wheelAcc.current) < 60) return;
          const step = wheelAcc.current > 0 ? 1 : -1;
          wheelAcc.current = 0;
          set((i) => Math.max(0, Math.min(total - 1, i + step)));
        };
        const stepper = (idx: number, total: number, set: (n: number) => void, label: string) => (
          <span className="flex items-center">
            <button onClick={() => set(Math.max(0, idx - 1))} disabled={idx === 0} className="ofst-cell !h-6 w-6" aria-label={`${label}: новее`}>
              ↑
            </button>
            <span className="tabular-nums px-1">
              {total ? idx + 1 : 0}/{total}
            </span>
            <button onClick={() => set(Math.min(total - 1, idx + 1))} disabled={idx >= total - 1} className="ofst-cell !h-6 w-6" aria-label={`${label}: старее`}>
              ↓
            </button>
          </span>
        );
        const bLabels = sourceLabels(compareItem);
        const beforeLabel = bLabels[bIdx] || 'оригинал';
        const afterLabel = shownAfter ? takeLabel(compareItem, aIdx) : '';
        const chosen = aIdx === 0 && compareResult?.approved;
        const neverRun = after.length === 0;
        const busy = (isRunningNow && aIdx === 0) || editingItemId === compareItem.id;
        const changeMode = (m: 'side' | 'slider') => {
          setCompareMode(m);
          try {
            localStorage.setItem('aips_compare_mode', m);
          } catch {
            /* private mode */
          }
        };
        // The divider of the «шторка»: drag anywhere on the frame
        const dragSplit = (e: React.PointerEvent<HTMLDivElement>) => {
          const box = e.currentTarget.getBoundingClientRect();
          const set = (x: number) => setSplit(Math.max(0, Math.min(100, ((x - box.left) / box.width) * 100)));
          set(e.clientX);
          const move = (ev: PointerEvent) => set(ev.clientX);
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        };
        const sideHead = (side: 'before' | 'after') => {
          const on = activeSide === side;
          return side === 'before' ? (
            <div className="flex items-center justify-between text-[12px] h-7 gap-1">
              <button onClick={() => setActiveSide('before')} className={`px-1 h-6 ${on ? 'bg-[var(--marker)]' : 'hover:bg-[var(--soft)]'}`} title="Листать эту сторону: ↑ ↓">
                до · {beforeLabel}
              </button>
              <span className="flex items-center">
                {bIdx > 0 && (
                  <button onClick={() => restoreSource(compareItem.id, bIdx)} className="ofst-cell !h-6">
                    сделать мастером
                  </button>
                )}
                {before.length > 1 && stepper(bIdx, before.length, (n) => { setActiveSide('before'); setBeforeIdx(n); }, 'исходник')}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[12px] h-7 gap-1">
              <button onClick={() => setActiveSide('after')} className={`px-1 h-6 ${on ? 'bg-[var(--marker)]' : 'hover:bg-[var(--soft)]'}`} title="Листать эту сторону: ↑ ↓">
                после{afterLabel ? ` · ${afterLabel}` : ''}
                {chosen ? ' · ★' : ''}
              </button>
              <span className="flex items-center flex-wrap justify-end">
                {shownAfter && (
                  <button onClick={() => chooseTake(compareItem.id, aIdx)} className={`ofst-cell !h-6 ${chosen ? 'is-on' : ''}`} title="A">
                    ★ {chosen ? 'выбран' : 'выбрать'}
                  </button>
                )}
                <button
                  onClick={() => run([compareItem.id])}
                  disabled={isRunning}
                  className={`ofst-cell !h-6 ${neverRun ? 'ofst-cell--primary' : ''}`}
                  title={neverRun ? 'Сделать первый кадр из «до»' : 'Обработать «до» ещё раз: новый дубль ляжет сверху, этот останется'}
                >
                  {neverRun ? 'прогнать это фото' : 'обработать ещё'}
                </button>
                {shownAfter && (
                  <button
                    onClick={() => promoteToSource(compareItem.id, aIdx)}
                    disabled={isRunning}
                    className="ofst-cell !h-6"
                    title="Этот кадр станет мастером («до»). Ничего не запускается: потом «обработать ещё»"
                  >
                    ← сделать мастером
                  </button>
                )}
                {shownAfter && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Удалить дубль ${afterLabel}?`)) deleteTake(compareItem.id, aIdx);
                    }}
                    disabled={busy}
                    className="ofst-cell ofst-cell--muted !h-6 hover:!bg-[var(--marker)]"
                  >
                    удалить
                  </button>
                )}
                {after.length > 1 && stepper(aIdx, after.length, (n) => { setActiveSide('after'); setAfterIdx(n); }, 'дубль')}
              </span>
            </div>
          );
        };
        const afterBody = busy ? (
          <div className="flex-1 flex items-center justify-center bg-[var(--soft)] text-[var(--grey)] text-[13px]">
            {editingItemId === compareItem.id ? 'правлю…' : 'генерация…'}
          </div>
        ) : shownAfter ? (
          <BigImage src={shownAfter} label="" />
        ) : (
          <div className="flex-1 flex flex-col gap-2 items-center justify-center bg-[var(--soft)] text-[var(--grey)] text-[13px] p-4 text-center">
            <span>{compareResult?.error || 'Это фото ещё не прогоняли'}</span>
            <button onClick={() => run([compareItem.id])} disabled={isRunning} className="ofst-cell ofst-cell--primary">
              Прогнать это фото
            </button>
          </div>
        );
        return (
          <div className="fixed inset-0 z-[60] bg-white flex flex-col p-2 gap-1 ofst-fade">
            <div className="shrink-0 flex items-center gap-2 border-b border-[var(--fg)] pb-1">
              <button onClick={() => setCompareId(null)} className="ofst-cell ofst-cell--primary" title="Выйти из полного экрана (Esc)">
                ← к сетке
              </button>
              <span className="truncate text-[13px] flex-1">
                <span className="text-[var(--grey)] tabular-nums">
                  {compareIndex + 1}/{catalog.items.length}
                </span>{' '}
                {compareItem.name}
              </span>
              <label className="flex items-center gap-1 text-[12px] text-[var(--grey)]" title="Насколько этот товар больше или меньше обычного в серии (100 = как все)">
                размер в серии
                <input
                  type="number"
                  min={20}
                  max={300}
                  step={5}
                  value={compareItem.size ?? 100}
                  onChange={(e) => setItemSize(compareItem.id, Math.max(20, Math.min(300, Number(e.target.value) || 100)))}
                  className="w-14 h-6 px-1 text-[12px] text-[var(--fg)] select-text"
                />
                %
              </label>
              <span className="hidden lg:inline text-[11px] text-[var(--grey)]">
                ← → товары · клик по стороне, потом ↑ ↓ или колесо — листать её · A выбрать · Esc выйти
              </span>
              <span className="flex">
                <button onClick={() => changeMode('side')} className={`ofst-cell !h-7 ${compareMode === 'side' ? 'is-on' : 'ofst-cell--muted'}`}>
                  рядом
                </button>
                <button onClick={() => changeMode('slider')} className={`ofst-cell !h-7 ${compareMode === 'slider' ? 'is-on' : 'ofst-cell--muted'}`}>
                  шторка
                </button>
              </span>
              <button onClick={() => setCompareId(null)} className="ofst-x" aria-label="Закрыть">
                ×
              </button>
            </div>
            {compareMode === 'side' ? (
              <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-0.5 overflow-auto md:overflow-hidden">
                {/* до */}
                <div
                  className={`flex flex-col min-h-[40vh] md:min-h-0 ${activeSide === 'before' ? '' : ''}`}
                  onWheel={flipOnWheel(before.length, setBeforeIdx)}
                  onMouseDown={() => setActiveSide('before')}
                >
                  {sideHead('before')}
                  <BigImage src={before[bIdx]} label="" />
                </div>
                {/* после */}
                <div className="flex flex-col min-h-[40vh] md:min-h-0" onWheel={flipOnWheel(after.length, setAfterIdx)} onMouseDown={() => setActiveSide('after')}>
                  {sideHead('after')}
                  {afterBody}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="grid grid-cols-2 gap-2">
                  {sideHead('before')}
                  {sideHead('after')}
                </div>
                {shownAfter && !busy ? (
                  <div
                    className="relative flex-1 min-h-[40vh] bg-[var(--soft)] overflow-hidden cursor-ew-resize touch-none"
                    onPointerDown={dragSplit}
                    onWheel={flipOnWheel(activeSide === 'before' ? before.length : after.length, activeSide === 'before' ? setBeforeIdx : setAfterIdx)}
                  >
                    <img src={before[bIdx]} alt="до" className="absolute inset-0 w-full h-full object-contain pointer-events-none" draggable={false} />
                    <img
                      src={shownAfter}
                      alt="после"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      style={{ clipPath: `inset(0 0 0 ${split}%)` }}
                      draggable={false}
                    />
                    <div className="absolute top-0 bottom-0 w-px bg-[var(--fg)] pointer-events-none" style={{ left: `${split}%` }}>
                      <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 bg-[var(--fg)] text-white text-[11px] px-1 whitespace-nowrap">◂ ▸</span>
                    </div>
                    <span className="absolute left-0 bottom-0 bg-white px-1 text-[11px]">до · {beforeLabel}</span>
                    <span className="absolute right-0 bottom-0 bg-[var(--fg)] text-white px-1 text-[11px]">после · {afterLabel}</span>
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-0 flex bg-white text-[11px]">
                      {[33, 50, 67].map((v) => (
                        <button
                          key={v}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => setSplit(v)}
                          className={`px-1 ${Math.round(split) === v ? 'bg-[var(--fg)] text-white' : 'hover:bg-[var(--soft)]'}`}
                        >
                          {v === 33 ? '⅓' : v === 50 ? '½' : '⅔'}
                        </button>
                      ))}
                    </span>
                  </div>
                ) : (
                  afterBody
                )}
              </div>
            )}
            {/* Edit the shown take by words; quick fixes are the «Исходник» master prompts */}
            {shownAfter && (
              <form
                className="shrink-0 flex flex-wrap items-center gap-0.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  editTake(compareItem.id, aIdx, editText);
                }}
              >
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  placeholder="править словами: «фон темнее», «убери крошки», «тень мягче»… Enter"
                  className="flex-1 min-w-[200px] h-7 px-1 bg-[var(--soft)] text-[13px] select-text"
                  disabled={!!editingItemId}
                />
                <button type="submit" disabled={!editText.trim() || !!editingItemId} className="ofst-cell ofst-cell--primary !h-7">
                  править
                </button>
                {quickEdits.slice(0, 8).map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => editTake(compareItem.id, aIdx, q.prompt, q.id)}
                    disabled={!!editingItemId}
                    className="ofst-cell ofst-cell--muted !h-7"
                    title={q.prompt.replace(SOURCE_FIX_MARKER, '').trim()}
                  >
                    {q.short}
                  </button>
                ))}
              </form>
            )}
            <div className="shrink-0 flex justify-between">
              <button onClick={() => compareIndex > 0 && setCompareId(catalog.items[compareIndex - 1].id)} disabled={compareIndex <= 0} className="ofst-cell">
                ← назад
              </button>
              {shownAfter && (
                <button
                  onClick={() => downloadBeforeAfter(compareItem, before[bIdx], shownAfter)}
                  className="ofst-cell"
                  title="Скачать одну картинку: слева «до», справа «после», внизу название"
                >
                  скачать «до | после»
                </button>
              )}
              <button
                onClick={() => compareIndex < catalog.items.length - 1 && setCompareId(catalog.items[compareIndex + 1].id)}
                disabled={compareIndex >= catalog.items.length - 1}
                className="ofst-cell"
              >
                дальше →
              </button>
            </div>
          </div>
        );
      })()}

      {/* Pick style references from the board or from positions */}
      {refPicker && (
        <PickPhotos
          title={refPicker === 'board' ? 'Эталон с доски' : 'Эталон из позиций'}
          confirmLabel="Взять эталоном"
          max={3 - catalog.refs.length}
          items={
            refPicker === 'board'
              ? boardCards.map((c) => ({ id: c.id, name: c.name || 'фото', src: c.src }))
              : products.filter((p) => p.photoDataUrl).map((p) => ({ id: p.id, name: p.name, src: p.photoDataUrl }))
          }
          onCancel={() => setRefPicker(null)}
          onConfirm={(picked) => {
            setRefPicker(null);
            addReferencesFromSrcs(picked);
          }}
        />
      )}

      {itemsFromBoard && (
        <PickPhotos
          title="Фото товаров с доски"
          confirmLabel="Добавить"
          max={2000}
          already={alreadyInCatalog(boardCards.map((c) => ({ id: c.id, name: c.name || '' })))}
          items={boardCards.map((c) => ({ id: c.id, name: c.name || 'фото', src: c.src }))}
          onCancel={() => setItemsFromBoard(false)}
          onConfirm={(picked) => {
            setItemsFromBoard(false);
            addItemsFromSrcs(picked);
          }}
        />
      )}

      {showDuplicates && (
        <DuplicatesDialog
          groups={duplicateGroups}
          labelOf={(it) => {
            const r = resultOf(it);
            const n = (r?.history?.length || 0) + (r?.src ? 1 : 0);
            return n ? `дублей ${n}${r?.approved ? ' · ★' : ''}` : 'не прогнано';
          }}
          onCancel={() => setShowDuplicates(false)}
          onConfirm={(removeIds) => {
            setShowDuplicates(false);
            const rm = new Set(removeIds);
            update((prev) => ({ ...prev, items: prev.items.filter((i) => !rm.has(i.id)) }));
            setNotice({ kind: 'info', text: `Убрано дубликатов: ${removeIds.length}.` });
          }}
        />
      )}

      {/* Product picker */}
      {showProductPicker && (
        <PickPhotos
          title="Фото товаров из позиций"
          confirmLabel="Добавить"
          max={2000}
          already={alreadyInCatalog(products.map((p) => ({ id: p.id, name: p.name })))}
          items={products.filter((p) => p.photoDataUrl).map((p) => ({ id: p.id, name: p.name, src: p.photoDataUrl }))}
          onCancel={() => setShowProductPicker(false)}
          onConfirm={(picked) => {
            setShowProductPicker(false);
            addItemsFromSrcs(picked);
          }}
        />
      )}

      {samplePicker && (
        <PickPhotos
          title={samplePicker === 'board' ? 'Образец с доски' : 'Образец из позиций'}
          confirmLabel="Взять образцом"
          max={3 - (catalog.samples?.length || 0)}
          items={
            samplePicker === 'board'
              ? boardCards.map((c) => ({ id: c.id, name: c.name || 'фото', src: c.src }))
              : products.filter((p) => p.photoDataUrl).map((p) => ({ id: p.id, name: p.name, src: p.photoDataUrl }))
          }
          onCancel={() => setSamplePicker(null)}
          onConfirm={(picked) => {
            setSamplePicker(null);
            addSamples(picked);
          }}
        />
      )}
      <input
        ref={sampleInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          const files: File[] = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = '';
          addSampleFiles(files);
        }}
      />

      {/* Hidden inputs */}
      <input
        ref={refInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          const files: File[] = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = '';
          addReferenceFiles(files);
        }}
      />
      <input
        ref={filesInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          const files: File[] = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = '';
          addItemFiles(files);
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(e) => {
          const files: File[] = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = '';
          addItemFiles(files);
        }}
      />
    </div>
  );
};

/** Step head: number and title stand on the rule, hint on the right */
const STEP_HELP: Record<number, string> = {
  1: '01 — первый шаг. Эталон: 1–3 кадра, как должны выглядеть все фото каталога (фон, свет, ракурс). Рецепт ниже описывает его словами; «Описать по эталону» напишет его сам.',
  2: '02 — второй шаг. Фото товаров, которые надо переснять в этом стиле: с доски, из позиций или с компьютера. Название берётся из имени файла или позиции.',
  3: '03 — третий шаг. Прогон: сначала тест на одном товаре, потом все. Каждый новый набор настроек сохраняется версией (v1, v2…), старые не пропадают.',
};

function StepTitle({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="ofst-run">
      <span className="flex items-center gap-1.5">
        {String(n).padStart(2, '0')} {title}
        {STEP_HELP[n] && <Info>{STEP_HELP[n]}</Info>}
      </span>
      <span>{hint}</span>
    </div>
  );
}

/** One cell for photos and folders; the browser picker takes one or the other, so it opens a two-line choice */
type SourceOption = { label: string; note?: string; disabled?: boolean; onClick: () => void };

/** A list of «where from» choices; picking one closes it */
function SourceList({ options, onDone }: { options: SourceOption[]; onDone: () => void }) {
  return (
    <div className="flex flex-col items-stretch ofst-pop">
      {options.map((o) => (
        <button
          key={o.label}
          disabled={o.disabled}
          onClick={() => {
            onDone();
            o.onClick();
          }}
          className="ofst-cell justify-between !h-7 text-left"
        >
          <span>{o.label}</span>
          {o.note && <span className="text-[var(--grey)] tabular-nums">{o.note}</span>}
        </button>
      ))}
    </div>
  );
}

/** One button that asks where the photos come from: board, positions or the computer */
function SourceMenu({ label, options }: { label: string; options: SourceOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-stretch max-w-[260px]">
      <button onClick={() => setOpen((v) => !v)} className={`ofst-cell ofst-cell--primary justify-start ${open ? 'is-on' : ''}`}>
        {label}
      </button>
      {open && <SourceList options={options} onDone={() => setOpen(false)} />}
    </div>
  );
}

function Thumb({ src, label, ratio, onOpen }: { src: string; label: string; ratio: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="relative block w-full bg-[var(--soft)]" style={{ aspectRatio: ratio }} title="Сравнить крупно">
      <img src={src} alt={label} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      <span className="absolute left-0 top-0 text-[11px] bg-white px-1">{label}</span>
    </button>
  );
}

function BigImage({ src, label }: { src: string; label: string }) {
  return (
    <div className="relative flex-1 min-h-[40vh] md:min-h-0 bg-[var(--soft)] overflow-hidden">
      <img src={src} alt={label} className="absolute inset-0 w-full h-full object-contain ofst-fade" key={src.slice(-40)} />
      {label && <span className="absolute left-0 top-0 text-[12px] bg-white px-1">{label}</span>}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`px-1 h-5 shrink-0 text-[12px] disabled:opacity-30 ${active ? 'bg-[var(--marker)]' : 'text-[var(--grey)] hover:text-[var(--fg)] hover:bg-[var(--soft)]'}`}
    >
      {children}
    </button>
  );
}

/** Choose up to `max` photos (board cards or positions) */
/** Pick photos from the board or the positions. Ones already in the catalog are marked; select all / only new / none. */
function PickPhotos({
  title,
  items,
  max,
  already,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  items: { id: string; name: string; src: string }[];
  max: number;
  already?: Set<string>;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (picked: { id: string; name: string; src: string }[]) => void;
}) {
  const fresh = items.filter((it) => !already?.has(it.id));
  const [picked, setPicked] = useState<string[]>(() => (max >= items.length ? fresh.map((it) => it.id) : []));
  const many = max > 3;
  const dupCount = items.length - fresh.length;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-2 ofst-fade" onClick={onCancel}>
      <div className="bg-white max-w-3xl w-full max-h-[86vh] flex flex-col p-2 gap-1" onClick={(e) => e.stopPropagation()}>
        <div className="ofst-run">
          <span>{title}</span>
          <span>
            выбрано {picked.length}
            {many ? ` из ${items.length}` : ` из ${max}`}
          </span>
        </div>
        {many && (
          <div className="flex flex-wrap items-center -ml-2 text-[12px]">
            <button onClick={() => setPicked(items.slice(0, max).map((it) => it.id))} className="ofst-cell !h-7">
              выбрать все
            </button>
            {dupCount > 0 && (
              <button onClick={() => setPicked(fresh.slice(0, max).map((it) => it.id))} className="ofst-cell !h-7">
                только новые ({fresh.length})
              </button>
            )}
            <button onClick={() => setPicked([])} className="ofst-cell ofst-cell--muted !h-7">
              снять все
            </button>
            {dupCount > 0 && <span className="text-[var(--grey)] px-2">уже в каталоге: {dupCount} — помечены и не выбраны</span>}
          </div>
        )}
        <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-3 sm:grid-cols-5 gap-0">
          {items.map((it) => {
            const on = picked.includes(it.id);
            const dup = already?.has(it.id);
            return (
              <button
                key={it.id}
                onClick={() =>
                  setPicked((prev) => (on ? prev.filter((x) => x !== it.id) : prev.length < max ? [...prev, it.id] : prev))
                }
                className={`relative text-left ${on ? '' : 'opacity-60 hover:opacity-100'}`}
              >
                <div className="aspect-square bg-[var(--soft)]">
                  {it.src && <img src={it.src} alt={it.name} className="w-full h-full object-cover" />}
                </div>
                {dup && <span className="absolute left-0 top-0 px-1 text-[10px] bg-[var(--fg)] text-white">уже в каталоге</span>}
                <div className={`absolute left-0 right-0 bottom-0 px-1 text-[11px] truncate ${on ? 'bg-[var(--marker)]' : 'bg-white/85'}`}>
                  {on && !many ? `${picked.indexOf(it.id) + 1} · ` : ''}
                  {it.name}
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end">
          <button onClick={onCancel} className="ofst-cell ofst-cell--muted">
            Отмена
          </button>
          <button
            onClick={() => onConfirm(items.filter((it) => picked.includes(it.id)))}
            disabled={picked.length === 0}
            className="ofst-cell ofst-cell--primary"
          >
            {confirmLabel} {picked.length || ''}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Duplicates: in each group tick what to remove; by default the one with the most work stays */
function DuplicatesDialog({
  groups,
  labelOf,
  onCancel,
  onConfirm,
}: {
  groups: CatalogItem[][];
  labelOf: (it: CatalogItem) => string;
  onCancel: () => void;
  onConfirm: (removeIds: string[]) => void;
}) {
  const score = (it: CatalogItem) =>
    Object.values(it.results).reduce((n, r) => n + (r.src ? 1 + (r.history?.length || 0) : 0) + (r.approved ? 100 : 0), 0);
  const [remove, setRemove] = useState<Set<string>>(() => {
    const out = new Set<string>();
    groups.forEach((g) => {
      const keep = [...g].sort((a, b) => score(b) - score(a))[0];
      g.forEach((it) => it.id !== keep.id && out.add(it.id));
    });
    return out;
  });
  const toggle = (id: string) =>
    setRemove((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-2 ofst-fade" onClick={onCancel}>
      <div className="bg-white max-w-3xl w-full max-h-[86vh] flex flex-col p-2 gap-1" onClick={(e) => e.stopPropagation()}>
        <div className="ofst-run">
          <span>Дубликаты</span>
          <span>групп {groups.length} · убрать {remove.size}</span>
        </div>
        <p className="text-[12px] text-[var(--grey)]">
          Одинаковые фото, одна и та же позиция или одинаковое название. Отмеченные жёлтым уберутся; по умолчанию остаётся то, где больше
          работы (дубли, ★). Клик по фото — переключить.
        </p>
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
          {groups.map((g, gi) => (
            <div key={gi}>
              <div className="ofst-run mb-0.5">
                <span>{g[0].name}</span>
                <span>{g.length}</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-0.5">
                {g.map((it) => {
                  const rm = remove.has(it.id);
                  return (
                    <button key={it.id} onClick={() => toggle(it.id)} className="relative text-left" title={rm ? 'Уберётся' : 'Останется'}>
                      <div className={`aspect-square bg-[var(--soft)] ${rm ? 'opacity-40' : ''}`}>
                        <img src={it.original} alt={it.name} className="w-full h-full object-cover" />
                      </div>
                      <span className={`absolute left-0 top-0 px-1 text-[10px] ${rm ? 'bg-[var(--marker)]' : 'bg-[var(--fg)] text-white'}`}>
                        {rm ? 'убрать' : 'оставить'}
                      </span>
                      <div className="text-[11px] truncate pt-0.5">{it.name}</div>
                      <div className="text-[10px] text-[var(--grey)]">{labelOf(it)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={onCancel} className="ofst-cell ofst-cell--muted">
            Отмена
          </button>
          <button onClick={() => onConfirm([...remove])} disabled={remove.size === 0} className="ofst-cell ofst-cell--primary">
            Убрать {remove.size}
          </button>
        </div>
      </div>
    </div>
  );
}
