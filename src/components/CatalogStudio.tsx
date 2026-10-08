import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Upload,
  FolderOpen,
  Wand2,
  Play,
  Square,
  RotateCcw,
  Check,
  Trash2,
  Download,
  Image as ImageIcon,
  Package,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Layers,
  Maximize2,
} from 'lucide-react';
import { Card, ProductItem } from '../types';
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
  emptyCatalogState,
  fileBaseName,
  generateCatalogShot,
  loadCatalogState,
  newId,
  saveCatalogState,
  slugify,
  withRetry,
} from '../utils/catalog';
import { buildZip, dataUrlToBytes, downloadBlob } from '../utils/zip';

interface CatalogStudioProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  products: ProductItem[];
  selectedCards: Card[];
  onOpenSettings: () => void;
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

function settingsKey(v: Pick<CatalogVersion, 'recipe' | 'category' | 'aspectRatio' | 'temperature' | 'refIds' | 'model'>) {
  return JSON.stringify([v.recipe.trim(), v.category, v.aspectRatio, v.temperature, [...v.refIds].sort(), v.model]);
}

const naturalSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export const CatalogStudio: React.FC<CatalogStudioProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  products,
  selectedCards,
  onOpenSettings,
}) => {
  const [catalog, setCatalog] = useState<CatalogState>(emptyCatalogState());
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [isDescribing, setIsDescribing] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [showProductPicker, setShowProductPicker] = useState(false);

  const stopRef = useRef(false);
  const refInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Load per-project catalog
  useEffect(() => {
    if (!isOpen || loadedFor === projectId) return;
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
  }, [isOpen, projectId, loadedFor]);

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

  const settingsChanged = !activeVersion || settingsKey(activeVersion) !== settingsKey(currentSettings);

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
    for (const file of files.slice(0, room)) {
      const src = await prepareImage(file, 1024, 0.88);
      if (src) added.push({ id: newId('ref'), name: file.name, src });
      else skipped++;
    }
    update((prev) => ({ ...prev, refs: [...prev.refs, ...added].slice(0, 3) }));
    if (skipped) setNotice({ kind: 'error', text: `${skipped} файл(ов) не открылось. HEIC сначала экспортируй в JPG.` });
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

  const addItemFiles = async (files: File[]) => {
    const images = files
      .filter((f) => f.type.startsWith('image/') || IMAGE_EXT.test(f.name))
      .sort((a, b) => naturalSort(a.name, b.name));
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

  const addFromProducts = async (picked: ProductItem[]) => {
    const added: CatalogItem[] = [];
    for (const p of picked) {
      if (!p.photoDataUrl) continue;
      const src = await compressDataUrl(p.photoDataUrl, 1536, 1536, 0.9);
      added.push({ id: newId('item'), name: p.name || 'товар', original: src, results: {} });
    }
    update((prev) => ({ ...prev, items: [...prev.items, ...added] }));
    setShowProductPicker(false);
  };

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

  const ensureVersion = (): CatalogVersion => {
    if (activeVersion && !settingsChanged) return activeVersion;
    const version: CatalogVersion = {
      id: newId('ver'),
      label: `v${catalog.versions.length + 1}`,
      ...currentSettings,
      createdAt: Date.now(),
    };
    update((prev) => ({ ...prev, versions: [...prev.versions, version], activeVersionId: version.id }));
    return version;
  };

  const run = async (itemIds: string[]) => {
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
    const items = catalog.items.filter((it) => itemIds.includes(it.id));
    const queue = [...items];

    stopRef.current = false;
    setIsRunning(true);
    setNotice(null);
    setProgress({ done: 0, total: items.length });
    items.forEach((it) => setResult(it.id, version.id, { status: 'running', error: undefined, approved: false }));

    let failed = 0;
    const worker = async () => {
      while (queue.length > 0 && !stopRef.current) {
        const item = queue.shift()!;
        try {
          const src = await withRetry(() => generateCatalogShot(item, version, refs));
          setResult(item.id, version.id, { status: 'done', src, error: undefined });
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
          delete results[version.id];
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
    const used = new Map<string, number>();
    const entries = picked.map(({ it, r }) => {
      const { bytes, ext } = dataUrlToBytes(r!.src!);
      const base = slugify(it.name);
      const n = (used.get(base) || 0) + 1;
      used.set(base, n);
      return { name: `${n > 1 ? `${base}-${n}` : base}.${ext}`, data: bytes };
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

  // Keyboard in compare view
  const compareIndex = compareId ? catalog.items.findIndex((i) => i.id === compareId) : -1;
  useEffect(() => {
    if (!compareId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCompareId(null);
      if (e.key === 'ArrowRight' && compareIndex < catalog.items.length - 1) setCompareId(catalog.items[compareIndex + 1].id);
      if (e.key === 'ArrowLeft' && compareIndex > 0) setCompareId(catalog.items[compareIndex - 1].id);
      if (e.key.toLowerCase() === 'a') toggleApprove(compareId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareId, compareIndex, catalog.items, activeVersion]);

  if (!isOpen) return null;

  const errorIds = catalog.items.filter((it) => resultOf(it)?.status === 'error').map((it) => it.id);
  const pendingIds = catalog.items.filter((it) => !resultOf(it) || settingsChanged).map((it) => it.id);
  const selectedList = catalog.items.filter((it) => selectedIds.has(it.id)).map((it) => it.id);
  const firstForTest = selectedList[0] || catalog.items[0]?.id;
  const compareItem = compareIndex >= 0 ? catalog.items[compareIndex] : null;
  const compareResult = compareItem ? resultOf(compareItem) : undefined;
  const [arW, arH] = catalog.aspectRatio.split(':').map(Number);

  return (
    <div id="catalog-studio" className="fixed inset-0 z-50 bg-gray-50 text-gray-800 flex flex-col select-none">
      {/* Header */}
      <header className="h-14 shrink-0 bg-white border-b border-gray-200 px-3 sm:px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate">Каталог · {projectName}</h2>
            <p className="text-[11px] text-gray-500 truncate">Один эталон → одинаковые кадры для всех товаров</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          title="Закрыть"
          aria-label="Закрыть каталог"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {notice && (
        <div
          className={`px-4 py-2 text-xs flex items-center justify-between gap-3 border-b ${
            notice.kind === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}
        >
          <span className="flex items-center gap-2">
            {notice.kind === 'error' && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
            {notice.text}
          </span>
          <button onClick={() => setNotice(null)} className="opacity-70 hover:opacity-100" aria-label="Скрыть">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-auto lg:overflow-hidden">
        {/* Left: setup */}
        <aside className="lg:w-[380px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-gray-200 lg:overflow-y-auto p-4 space-y-5">
          {/* Step 1 */}
          <section className="space-y-2.5">
            <StepTitle n={1} title="Эталон стиля" hint="1–3 кадра, как должен выглядеть весь каталог" />
            <div className="grid grid-cols-3 gap-2">
              {catalog.refs.map((ref) => (
                <div key={ref.id} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100 group">
                  <img src={ref.src} alt={ref.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => update((prev) => ({ ...prev, refs: prev.refs.filter((r) => r.id !== ref.id) }))}
                    className="absolute top-1 right-1 p-1 bg-white/90 rounded-md text-gray-600 hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="Убрать"
                    aria-label="Убрать эталон"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {catalog.refs.length < 3 && (
                <button
                  onClick={() => refInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-400 hover:text-blue-600 flex flex-col items-center justify-center gap-1 text-[11px]"
                >
                  <Upload className="w-4 h-4" />
                  Добавить
                </button>
              )}
            </div>
            {selectedCards.length > 0 && catalog.refs.length < 3 && (
              <button onClick={addReferencesFromCanvas} className="text-[11px] text-blue-600 hover:underline">
                Взять выделенные с доски ({selectedCards.length})
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-gray-600">Тип</span>
                <select
                  value={catalog.category}
                  onChange={(e) => changeCategory(e.target.value as CatalogCategory)}
                  className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
                >
                  {(Object.keys(CATEGORY_LABELS) as CatalogCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-gray-600">Формат кадра</span>
                <select
                  value={catalog.aspectRatio}
                  onChange={(e) => update((prev) => ({ ...prev, aspectRatio: e.target.value }))}
                  className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
                >
                  {ASPECT_RATIOS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-600">Рецепт кадра</span>
                <button
                  onClick={describeStyle}
                  disabled={isDescribing || catalog.refs.length === 0}
                  className="text-[11px] flex items-center gap-1 text-purple-700 hover:text-purple-900 disabled:text-gray-400"
                  title="Модель сама вытащит ракурс, свет, фон из эталонов"
                >
                  {isDescribing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                  Описать стиль по эталону
                </button>
              </div>
              <textarea
                value={catalog.recipe}
                onChange={(e) => update((prev) => ({ ...prev, recipe: e.target.value }))}
                rows={7}
                className="w-full text-[11px] font-mono leading-relaxed border border-gray-300 rounded-lg p-2 bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-500 select-text"
                spellCheck={false}
              />
            </div>

            <label className="block space-y-1">
              <span className="flex justify-between text-[11px] font-medium text-gray-600">
                <span>Одинаковость кадров</span>
                <span className="font-mono text-gray-500">температура {catalog.temperature.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0.1}
                max={0.7}
                step={0.05}
                value={catalog.temperature}
                onChange={(e) => update((prev) => ({ ...prev, temperature: Number(e.target.value) }))}
                className="w-full accent-blue-600"
              />
              <span className="flex justify-between text-[10px] text-gray-400">
                <span>строже, одинаковее</span>
                <span>свободнее</span>
              </span>
            </label>
          </section>

          {/* Step 2 */}
          <section className="space-y-2.5">
            <StepTitle n={2} title="Фото товаров" hint="Исходники клиента. Имя файла станет названием." />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => folderInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              >
                <FolderOpen className="w-3.5 h-3.5 text-blue-600" /> Папка
              </button>
              <button
                onClick={() => filesInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              >
                <ImageIcon className="w-3.5 h-3.5 text-blue-600" /> Файлы
              </button>
            </div>
            {products.length > 0 && (
              <button onClick={() => setShowProductPicker(true)} className="text-[11px] text-blue-600 hover:underline flex items-center gap-1">
                <Package className="w-3 h-3" /> Из библиотеки продуктов ({products.length})
              </button>
            )}
            <p className="text-[11px] text-gray-500">
              В каталоге: <b className="text-gray-800">{catalog.items.length}</b> фото
              {selectedList.length > 0 && <> · выбрано {selectedList.length}</>}
            </p>
          </section>

          {/* Step 3 */}
          <section className="space-y-2.5">
            <StepTitle n={3} title="Прогон" hint="Сначала тест на одном фото, потом весь каталог" />
            {settingsChanged && catalog.versions.length > 0 && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                Настройки изменились: следующий прогон станет версией v{catalog.versions.length + 1}, старая сохранится.
              </p>
            )}
            {isRunning ? (
              <div className="space-y-2">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> {progress.done} из {progress.total}
                  </span>
                  <button onClick={stop} className="flex items-center gap-1 text-red-600 hover:text-red-800 font-medium">
                    <Square className="w-3 h-3" /> Стоп
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => firstForTest && run([firstForTest])}
                  disabled={!firstForTest}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-blue-600 text-blue-700 hover:bg-blue-50 disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5" /> Тест на одном фото
                </button>
                <button
                  onClick={() => run(selectedList.length ? selectedList : pendingIds)}
                  disabled={catalog.items.length === 0 || (selectedList.length === 0 && pendingIds.length === 0)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5" />
                  {selectedList.length
                    ? `Прогнать выбранные (${selectedList.length})`
                    : `Прогнать ${settingsChanged ? 'все' : 'оставшиеся'} (${pendingIds.length})`}
                </button>
                {errorIds.length > 0 && (
                  <button
                    onClick={() => run(errorIds)}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Повторить ошибки ({errorIds.length})
                  </button>
                )}
              </div>
            )}
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Каждое фото — один платный запрос к модели <span className="font-mono">{getImageModel()}</span>. Модель
              меняется в настройках.
            </p>
          </section>
        </aside>

        {/* Right: results */}
        <main className="flex-1 min-w-0 flex flex-col lg:overflow-hidden">
          <div className="shrink-0 px-4 py-2.5 bg-white border-b border-gray-200 flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              {catalog.versions.length === 0 ? (
                <span className="text-xs text-gray-500">Версий пока нет: запусти тест.</span>
              ) : (
                catalog.versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => applyVersionSettings(v)}
                    title={`${CATEGORY_LABELS[v.category]} · ${v.aspectRatio} · t=${v.temperature}`}
                    className={`text-xs font-mono px-2.5 py-1 rounded-md border ${
                      v.id === catalog.activeVersionId
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {v.label}
                  </button>
                ))
              )}
              {activeVersion && (
                <span className="text-[11px] text-gray-500 ml-1">
                  готово {stats.done}/{catalog.items.length}
                  {stats.approved > 0 && <> · одобрено {stats.approved}</>}
                  {stats.errors > 0 && <span className="text-red-600"> · ошибок {stats.errors}</span>}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {catalog.items.length > 0 && (
                <button
                  onClick={() =>
                    setSelectedIds((prev) =>
                      prev.size === catalog.items.length ? new Set() : new Set(catalog.items.map((i) => i.id))
                    )
                  }
                  className="text-[11px] text-gray-600 hover:text-gray-900 px-2 py-1"
                >
                  {selectedIds.size === catalog.items.length ? 'Снять выбор' : 'Выбрать все'}
                </button>
              )}
              <button
                onClick={exportZip}
                disabled={!activeVersion || stats.done === 0}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                title="Если есть одобренные — только они, иначе все готовые"
              >
                <Download className="w-3.5 h-3.5" /> ZIP {stats.approved > 0 ? `(${stats.approved})` : ''}
              </button>
            </div>
          </div>

          {activeVersion && (
            <div className="shrink-0 px-4 py-1.5 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-100">
              {CATEGORY_CHECKS[activeVersion.category]} Открой фото, чтобы сравнить крупно (← → листать, A — одобрить).
            </div>
          )}

          <div className="flex-1 lg:overflow-y-auto p-4">
            {catalog.items.length === 0 ? (
              <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center text-gray-400 gap-2">
                <FolderOpen className="w-8 h-8" />
                <p className="text-sm">Загрузи папку с фото товаров (шаг 2)</p>
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {catalog.items.map((item) => {
                  const r = resultOf(item);
                  const selected = selectedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`bg-white rounded-xl border overflow-hidden ${
                        r?.approved ? 'border-green-500 ring-1 ring-green-500' : selected ? 'border-blue-500' : 'border-gray-200'
                      }`}
                    >
                      <div className="grid grid-cols-2 gap-px bg-gray-200">
                        <Thumb src={item.original} label="до" ratio={`${arW} / ${arH}`} onOpen={() => setCompareId(item.id)} />
                        <div className="relative bg-gray-100" style={{ aspectRatio: `${arW} / ${arH}` }}>
                          {r?.status === 'done' && r.src ? (
                            <Thumb src={r.src} label="после" ratio={`${arW} / ${arH}`} onOpen={() => setCompareId(item.id)} />
                          ) : r?.status === 'running' ? (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                              <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                          ) : r?.status === 'error' ? (
                            <div className="absolute inset-0 p-2 flex flex-col items-center justify-center text-center gap-1">
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                              <span className="text-[10px] text-red-700 line-clamp-4 select-text">{r.error}</span>
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400">ещё не прогнано</div>
                          )}
                        </div>
                      </div>
                      <div className="px-2 py-1.5 flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelect(item.id)}
                          className="accent-blue-600 shrink-0"
                          aria-label="Выбрать"
                        />
                        <input
                          value={item.name}
                          onChange={(e) => renameItem(item.id, e.target.value)}
                          className="flex-1 min-w-0 text-xs bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none select-text"
                        />
                        <IconBtn
                          title={r?.approved ? 'Снять одобрение' : 'Одобрить'}
                          onClick={() => toggleApprove(item.id)}
                          disabled={r?.status !== 'done'}
                          active={Boolean(r?.approved)}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </IconBtn>
                        <IconBtn title="Перегенерировать" onClick={() => run([item.id])} disabled={isRunning}>
                          <RotateCcw className="w-3.5 h-3.5" />
                        </IconBtn>
                        <IconBtn title="Убрать из каталога" onClick={() => removeItem(item.id)} disabled={isRunning}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </IconBtn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Compare view */}
      {compareItem && (
        <div className="fixed inset-0 z-[60] bg-gray-950/95 flex flex-col" onClick={() => setCompareId(null)}>
          <div className="shrink-0 px-4 py-3 flex items-center justify-between text-white" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm font-medium truncate">
              {compareIndex + 1}/{catalog.items.length} · {compareItem.name}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleApprove(compareItem.id)}
                disabled={compareResult?.status !== 'done'}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 ${
                  compareResult?.approved ? 'bg-green-500 text-white' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                <Check className="w-3.5 h-3.5" /> {compareResult?.approved ? 'Одобрено' : 'Одобрить (A)'}
              </button>
              <button
                onClick={() => run([compareItem.id])}
                disabled={isRunning}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Ещё раз
              </button>
              <button onClick={() => setCompareId(null)} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Закрыть">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 md:grid-rows-1 gap-3 p-3 pt-0 overflow-auto md:overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <BigImage src={compareItem.original} label="до" />
            {compareResult?.status === 'done' && compareResult.src ? (
              <BigImage src={compareResult.src} label={`после · ${activeVersion?.label}`} />
            ) : (
              <div className="min-h-[40vh] md:min-h-0 flex items-center justify-center text-white/50 text-sm rounded-lg border border-white/10 p-4 text-center">
                {compareResult?.status === 'running' ? <Loader2 className="w-6 h-6 animate-spin" /> : compareResult?.error || 'Ещё не прогнано'}
              </div>
            )}
          </div>
          <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none">
            {compareIndex > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCompareId(catalog.items[compareIndex - 1].id);
                }}
                className="pointer-events-auto m-2 p-2 rounded-full bg-white/10 hover:bg-white/25 text-white"
                aria-label="Предыдущее"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="absolute inset-y-0 right-0 flex items-center pointer-events-none">
            {compareIndex < catalog.items.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCompareId(catalog.items[compareIndex + 1].id);
                }}
                className="pointer-events-auto m-2 p-2 rounded-full bg-white/10 hover:bg-white/25 text-white"
                aria-label="Следующее"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Product picker */}
      {showProductPicker && (
        <ProductPicker products={products} onCancel={() => setShowProductPicker(false)} onConfirm={addFromProducts} />
      )}

      {/* Hidden inputs */}
      <input
        ref={refInputRef}
        type="file"
        accept="image/*"
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
        accept="image/*"
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

function StepTitle({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-5 h-5 shrink-0 rounded-full bg-gray-900 text-white text-[11px] font-semibold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <div>
        <h3 className="text-sm font-semibold text-gray-900 leading-tight">{title}</h3>
        <p className="text-[11px] text-gray-500">{hint}</p>
      </div>
    </div>
  );
}

function Thumb({ src, label, ratio, onOpen }: { src: string; label: string; ratio: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="relative block w-full bg-gray-100 group" style={{ aspectRatio: ratio }} title="Сравнить крупно">
      <img src={src} alt={label} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      <span className="absolute left-1 top-1 text-[9px] uppercase tracking-wide font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded">
        {label}
      </span>
      <Maximize2 className="absolute right-1.5 bottom-1.5 w-3.5 h-3.5 text-white drop-shadow opacity-0 group-hover:opacity-100" />
    </button>
  );
}

function BigImage({ src, label }: { src: string; label: string }) {
  return (
    <div className="relative min-h-[40vh] md:min-h-0 h-full rounded-lg bg-black/40 overflow-hidden">
      <img src={src} alt={label} className="absolute inset-0 w-full h-full object-contain" />
      <span className="absolute left-2 top-2 text-[10px] uppercase tracking-wide font-semibold bg-black/60 text-white px-2 py-0.5 rounded">
        {label}
      </span>
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
      className={`p-1.5 rounded-md shrink-0 disabled:opacity-30 ${
        active ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

function ProductPicker({
  products,
  onCancel,
  onConfirm,
}: {
  products: ProductItem[];
  onCancel: () => void;
  onConfirm: (picked: ProductItem[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(products.map((p) => p.id)));
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold">Добавить из библиотеки продуктов</div>
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (next.has(p.id)) next.delete(p.id);
                  else next.add(p.id);
                  return next;
                })
              }
              className={`rounded-lg border overflow-hidden text-left ${picked.has(p.id) ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'}`}
            >
              <div className="aspect-square bg-gray-100">
                {p.photoDataUrl && <img src={p.photoDataUrl} alt={p.name} className="w-full h-full object-cover" />}
              </div>
              <div className="px-1.5 py-1 text-[10px] truncate">{p.name}</div>
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">
            Отмена
          </button>
          <button
            onClick={() => onConfirm(products.filter((p) => picked.has(p.id)))}
            disabled={picked.size === 0}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg disabled:opacity-40"
          >
            Добавить {picked.size}
          </button>
        </div>
      </div>
    </div>
  );
}
