import React, { useRef, useState, useEffect } from 'react';
import { ProductItem } from '../types';
import { compressImageDataUrl, loadGlobalProducts, saveGlobalProducts } from '../utils/storage';
import { ImageCropModal } from './ImageCropModal';
import { normalizeImageFiles, isImageFile } from '../utils/heic';
import { PRODUCT_DRAG_TYPE } from '../utils/dragTypes';
import { EXPORT_PRESETS, ExportPhotos, ExportPreset, exportPositions } from '../utils/positionsExport';
import { NO_GROUP, SLOT_DRAG_TYPE, SlotRef, groupByCategory, mergeInto, movePhoto, renameCategory, setCategory, slotSet } from '../utils/positions';

/** One square photo slot in the positions table; ★ marks the final photo of the row. */
const Slot: React.FC<{
  src: string;
  label: string;
  isFinal: boolean;
  dragRef: SlotRef;
  onPick: () => void;
  onMarkFinal: () => void;
}> = ({ src, label, isFinal, dragRef, onPick, onMarkFinal }) => (
  <div className={`relative w-[104px] h-[104px] bg-[var(--soft)] group/slot ${isFinal && src ? 'ofst-outline' : ''}`}>
    {src ? (
      <img
        src={src}
        alt={label}
        className="w-full h-full object-cover cursor-grab"
        draggable
        onDragStart={(e) => {
          // A photo moves between cells; the row's own drag (to the board) must not start
          e.stopPropagation();
          e.dataTransfer.setData(SLOT_DRAG_TYPE, JSON.stringify(dragRef));
          e.dataTransfer.effectAllowed = 'move';
        }}
        title="Перетащи в другую ячейку или строку"
      />
    ) : (
      <button onClick={onPick} className="w-full h-full text-[11px] text-[var(--grey)] hover:text-[var(--fg)] hover:bg-[var(--soft-2)] cursor-pointer" title={`Загрузить: ${label}`}>
        + {label}
      </button>
    )}
    {src && (
      <>
        <button
          onClick={onMarkFinal}
          className={`absolute top-0 left-0 px-1 text-[11px] leading-4 cursor-pointer ${isFinal ? 'bg-[var(--marker)] text-[var(--fg)]' : 'bg-white text-[var(--grey)] opacity-0 group-hover/slot:opacity-100'}`}
          title="Сделать финальным фото позиции"
        >
          ★
        </button>
        <button
          onClick={onPick}
          className="absolute bottom-0 right-0 px-1 text-[10px] bg-white opacity-0 group-hover/slot:opacity-100 cursor-pointer"
          title="Заменить"
        >
          заменить
        </button>
      </>
    )}
  </div>
);

const normName = (s: string) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Names from a CSV (column "name"/"název"/"название", else first column), a JSON array, or plain lines. */
function parseNameList(text: string, fileName: string): string[] {
  const t = text.replace(/^\uFEFF/, '');
  if (/\.json$/i.test(fileName)) {
    try {
      const data = JSON.parse(t);
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      return arr.map((x: any) => (typeof x === 'string' ? x : x?.name || x?.title || '')).filter(Boolean);
    } catch {
      return [];
    }
  }
  const rows: string[][] = [];
  for (const line of t.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
      } else if ((ch === ',' || ch === ';' || ch === '\t') && !q) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.toLowerCase());
  const col = header.findIndex((h) => ['name', 'název', 'nazev', 'название', 'title', 'product'].includes(h));
  if (col >= 0) return rows.slice(1).map((r) => r[col]).filter(Boolean);
  return rows.map((r) => r[0]).filter(Boolean);
}

export { loadGlobalProducts, saveGlobalProducts };

interface ProductLibraryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductItem[];
  onSaveProducts: (products: ProductItem[]) => void;
  onAddProductToCanvas?: (product: ProductItem) => void;
  projectName?: string;
}

export const ProductLibraryDrawer: React.FC<ProductLibraryDrawerProps> = ({
  isOpen,
  onClose,
  products,
  onSaveProducts,
  onAddProductToCanvas,
  projectName = 'Проект',
}) => {
  const [showExport, setShowExport] = useState(false);
  const [exportPreset, setExportPreset] = useState<ExportPreset>('names');
  const [exportPhotos, setExportPhotos] = useState<ExportPhotos>('final');
  const [exportBaseUrl, setExportBaseUrl] = useState('');
  const [localProducts, setLocalProducts] = useState<ProductItem[]>(products || []);
  const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);
  const [cropModalState, setCropModalState] = useState<{
    isOpen: boolean;
    rawSrc: string;
    index: number;
    productName: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderBatchRef = useRef<HTMLInputElement>(null);
  const listBatchRef = useRef<HTMLInputElement>(null);
  const [batchNote, setBatchNote] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [variantCols, setVariantCols] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('aips_variant_cols') || '2');
    } catch {
      return 2;
    }
  });
  const variantInputRef = useRef<HTMLInputElement>(null);
  const variantTarget = useRef<{ row: number; col: number } | null>(null);

  useEffect(() => {
    setLocalProducts(products || []);
  }, [products, isOpen]);

  if (!isOpen) return null;

  // Columns: the chosen number, or more if some position already has more variants (e.g. dropped from the board)
  const shownCols = Math.max(variantCols, ...localProducts.map((p) => p.variants?.length || 0));

  const handleAddRow = () => {
    const newItem: ProductItem = {
      id: `prod_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: `Продукт ${localProducts.length + 1}`,
      photoDataUrl: '',
    };
    commit([...localProducts, newItem]);
  };

  const handleNameChange = (index: number, newName: string) => {
    setLocalProducts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name: newName };
      return updated;
    });
  };

  const handleDeleteRow = (index: number) => {
    commit(localProducts.filter((_, i) => i !== index));
  };

  const handleTriggerUpload = (index: number) => {
    setActiveUploadIndex(index);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked || activeUploadIndex === null) return;

    try {
      const [file] = await normalizeImageFiles([picked]);
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rawDataUrl = ev.target?.result as string;
        if (rawDataUrl) {
          setCropModalState({
            isOpen: true,
            rawSrc: rawDataUrl,
            index: activeUploadIndex,
            productName: localProducts[activeUploadIndex]?.name || 'Продукт',
          });
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to read product image', err);
    }
  };

  const handleSaveCroppedImage = (croppedDataUrl: string) => {
    if (!cropModalState) return;
    const targetIndex = cropModalState.index;
    const updated = [...localProducts];
    if (updated[targetIndex]) {
      updated[targetIndex] = {
        ...updated[targetIndex],
        photoDataUrl: croppedDataUrl,
      };
      setLocalProducts(updated);
      onSaveProducts(updated);
      saveGlobalProducts(updated);
    }
    setCropModalState(null);
  };

  const handleCancelCrop = () => {
    setCropModalState(null);
  };

  // Batch: a folder of photos (file name = product name) and/or a list of names (CSV, JSON, TXT)

  const commit = (next: ProductItem[]) => {
    setLocalProducts(next);
    onSaveProducts(next);
    saveGlobalProducts(next);
  };

  const handleBatchPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked: File[] = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    const images = await normalizeImageFiles(picked.filter((f) => isImageFile(f) && !f.name.startsWith('.')));
    if (images.length === 0) return;
    let next = [...localProducts];
    let added = 0;
    let filled = 0;
    for (let i = 0; i < images.length; i++) {
      setBatchNote(`Фото ${i + 1} из ${images.length}…`);
      const raw = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => resolve('');
        r.readAsDataURL(images[i]);
      });
      if (!raw) continue;
      const photo = await compressImageDataUrl(raw, 1200, 0.85);
      const name = images[i].name.replace(/\.[^.]+$/, '');
      const idx = next.findIndex((p) => normName(p.name) === normName(name));
      if (idx >= 0) {
        next[idx] = { ...next[idx], photoDataUrl: photo };
        filled++;
      } else {
        next.push({ id: `prod_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`, name, photoDataUrl: photo });
        added++;
      }
    }
    commit(next);
    setBatchNote(`Готово: новых ${added}, фото добавлено к существующим ${filled}.`);
  };

  const handleBatchList = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const names = parseNameList(await file.text(), file.name);
    const existing = new Set(localProducts.map((p) => normName(p.name)));
    const fresh = [...new Set(names.map((n) => n.trim()))].filter((n) => n && !existing.has(normName(n)));
    commit([
      ...localProducts,
      ...fresh.map((name, i) => ({ id: `prod_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`, name, photoDataUrl: '' })),
    ]);
    setBatchNote(`Из списка добавлено ${fresh.length} позиций. Теперь можно загрузить папку с фото — они подставятся по названию.`);
  };

  const changeVariantCols = (n: number) => {
    const v = Math.max(0, Math.min(8, n));
    setVariantCols(v);
    try {
      localStorage.setItem('aips_variant_cols', String(v));
    } catch {
      /* private mode */
    }
  };
  const setFinal = (row: number, col: number) => {
    const next = localProducts.map((p, i) => (i === row ? { ...p, finalIndex: col } : p));
    commit(next);
  };
  const triggerVariantUpload = (row: number, col: number) => {
    variantTarget.current = { row, col };
    variantInputRef.current?.click();
  };
  const handleVariantFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    const target = variantTarget.current;
    if (!picked || !target) return;
    const [file] = await normalizeImageFiles([picked]);
    if (!file) return;
    const raw = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve('');
      r.readAsDataURL(file);
    });
    if (!raw) return;
    const photo = await compressImageDataUrl(raw, 1200, 0.85);
    const next = localProducts.map((p, i) => {
      if (i !== target.row) return p;
      const variants = [...(p.variants || [])];
      while (variants.length <= target.col) variants.push(null);
      variants[target.col] = photo;
      return { ...p, variants };
    });
    commit(next);
  };



  // ---- Drag and drop inside the table ----
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);

  const readImageFile = async (file: File): Promise<string> => {
    const [img] = await normalizeImageFiles([file]);
    if (!img) return '';
    const raw = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve('');
      r.readAsDataURL(img);
    });
    return raw ? compressImageDataUrl(raw, 1200, 0.85) : '';
  };

  const acceptsDrop = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(SLOT_DRAG_TYPE) || e.dataTransfer.types.includes(PRODUCT_DRAG_TYPE) || e.dataTransfer.types.includes('Files');

  const dropHandlers = (key: string, onDrop: (e: React.DragEvent) => void) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!acceptsDrop(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move';
      if (dropKey !== key) setDropKey(key);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropKey((k) => (k === key ? null : k));
    },
    onDrop: (e: React.DragEvent) => {
      if (!acceptsDrop(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropKey(null);
      onDrop(e);
    },
  });

  /** Something dropped on a photo cell: a photo from another cell, whole rows, or files from the computer */
  const dropOnSlot = async (e: React.DragEvent, target: SlotRef) => {
    const slotData = e.dataTransfer.getData(SLOT_DRAG_TYPE);
    if (slotData) {
      commit(movePhoto(localProducts, JSON.parse(slotData) as SlotRef, target));
      return;
    }
    const rows = e.dataTransfer.getData(PRODUCT_DRAG_TYPE);
    if (rows) {
      commit(mergeInto(localProducts, JSON.parse(rows) as string[], target.id));
      return;
    }
    const files = Array.from(e.dataTransfer.files).filter((f) => isImageFile(f));
    if (files.length === 0) return;
    let next = localProducts;
    let slot = target.slot;
    for (const f of files) {
      const photo = await readImageFile(f);
      if (photo) next = next.map((p) => (p.id === target.id ? slotSet(p, slot, photo) : p));
      slot = slot < 0 ? 0 : slot + 1;
    }
    commit(next);
  };

  /** Rows dropped on another row's name: they become more angles of it */
  const dropOnRow = (e: React.DragEvent, targetId: string) => {
    const slotData = e.dataTransfer.getData(SLOT_DRAG_TYPE);
    if (slotData) {
      const from = JSON.parse(slotData) as SlotRef;
      const target = localProducts.find((p) => p.id === targetId);
      if (!target) return;
      // First free cell: the original, else the first empty angle column, else a new column
      const variants = target.variants || [];
      const emptyVariant = variants.findIndex((v) => !v);
      const free = !target.photoDataUrl ? -1 : emptyVariant >= 0 ? emptyVariant : variants.length;
      commit(movePhoto(localProducts, from, { id: targetId, slot: free }));
      return;
    }
    const rows = e.dataTransfer.getData(PRODUCT_DRAG_TYPE);
    if (rows) commit(mergeInto(localProducts, JSON.parse(rows) as string[], targetId));
  };

  /** Rows dropped on a group header: they move into that group */
  const dropOnGroup = (e: React.DragEvent, title: string) => {
    const rows = e.dataTransfer.getData(PRODUCT_DRAG_TYPE);
    if (rows) commit(setCategory(localProducts, JSON.parse(rows) as string[], title));
  };

  const groups = groupByCategory(localProducts);

  return (
    <div
        id="drawer-products-panel"
        className="ofst-panel h-full flex flex-col select-text"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 pt-2">
          <div className="ofst-run">
            <span>Позиции проекта</span>
            <span className="tabular-nums">{localProducts.length}</span>
            <button onClick={onClose} className="hover:text-[var(--fg)] cursor-pointer">
              закрыть
            </button>
          </div>
        </div>

        {/* One row of tools */}
        <div className="flex flex-wrap items-center px-2 pt-1 text-[13px]">
          <button onClick={handleAddRow} className="ofst-cell -ml-2">+ Позиция</button>
          <button
            onClick={() => folderBatchRef.current?.click()}
            className="ofst-cell"
            title="Каждое фото станет позицией, название — из имени файла. Если позиция с таким названием уже есть, к ней добавится фото."
          >
            Папка с фото
          </button>
          <button
            onClick={() => listBatchRef.current?.click()}
            className="ofst-cell"
            title="CSV, JSON или TXT: берётся колонка name (или первая колонка / каждая строка)"
          >
            Список CSV / JSON
          </button>
          <button onClick={() => setShowExport((v) => !v)} className={`ofst-cell ${showExport ? 'is-on' : ''}`} title="CSV для магазина и ZIP с фото, названными по позициям">
            Экспорт
          </button>
          <span className="flex-1" />
          <span className="text-[var(--grey)] px-1">Варианты {shownCols}</span>
          <button className="ofst-cell w-7" onClick={() => changeVariantCols(variantCols + 1)} title="Добавить колонку вариантов">
            +
          </button>
          {variantCols > 0 && (
            <button className="ofst-cell w-7" onClick={() => changeVariantCols(variantCols - 1)} title="Убрать последнюю пустую колонку">
              −
            </button>
          )}
          <span className="text-[11px] text-[var(--grey)] px-1" title="Каждое изменение сразу сохраняется в этом браузере">
            сохраняется само
          </span>
        </div>
        {showExport && (
          <div className="mx-2 mt-1 p-2 bg-[var(--soft)] text-[13px] space-y-2 ofst-pop">
            <div className="ofst-run">
              <span>Экспорт позиций</span>
              <span>{localProducts.length}</span>
            </div>
            <div>
              <div className="flex flex-wrap -ml-2">
                {EXPORT_PRESETS.map((x) => (
                  <button key={x.id} onClick={() => setExportPreset(x.id)} className={`ofst-cell ${exportPreset === x.id ? 'is-on' : ''}`}>
                    {x.label}
                  </button>
                ))}
              </div>
              <p className="text-[12px] text-[var(--grey)] pt-0.5">{EXPORT_PRESETS.find((x) => x.id === exportPreset)?.note}</p>
            </div>
            <div className="flex flex-wrap items-center -ml-2">
              <span className="text-[12px] text-[var(--grey)] px-2">Фото</span>
              {(
                [
                  ['final', 'финальные ★'],
                  ['all', 'исходник + все варианты'],
                  ['source', 'только исходники'],
                ] as [ExportPhotos, string][]
              ).map(([id, label]) => (
                <button key={id} onClick={() => setExportPhotos(id)} className={`ofst-cell !h-7 ${exportPhotos === id ? 'is-on' : 'ofst-cell--muted'}`}>
                  {label}
                </button>
              ))}
            </div>
            {exportPreset !== 'names' && (
              <label className="block">
                <span className="text-[12px] text-[var(--grey)]">Адрес папки с фото, если уже залиты (необязательно)</span>
                <input
                  value={exportBaseUrl}
                  onChange={(e) => setExportBaseUrl(e.target.value)}
                  placeholder="https://…/photos"
                  className="w-full h-8 px-2 !bg-white text-[13px]"
                />
              </label>
            )}
            <div className="flex justify-end">
              <button onClick={() => setShowExport(false)} className="ofst-cell ofst-cell--muted">
                Отмена
              </button>
              <button
                disabled={localProducts.length === 0}
                onClick={() => {
                  const r = exportPositions(localProducts, { preset: exportPreset, photos: exportPhotos, baseUrl: exportBaseUrl, projectName });
                  setBatchNote(r.missing.length ? `Скачан ZIP. Без фото: ${r.missing.slice(0, 6).join(', ')}${r.missing.length > 6 ? '…' : ''}` : 'Скачан ZIP с позициями и фото.');
                  setShowExport(false);
                }}
                className="ofst-cell ofst-cell--primary"
              >
                Скачать ZIP
              </button>
            </div>
          </div>
        )}
        {batchNote && <p className="px-2 pt-1 text-[11px] text-[var(--grey)] leading-snug">{batchNote}</p>}
        <input
          ref={folderBatchRef}
          type="file"
          multiple
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={handleBatchPhotos}
          {...({ webkitdirectory: '' } as Record<string, string>)}
        />
        <input ref={listBatchRef} type="file" accept=".csv,.json,.txt,text/csv,application/json,text/plain" className="hidden" onChange={handleBatchList} />

        <label className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[11px] text-[var(--grey)] cursor-pointer">
          <input
            type="checkbox"
            checked={localProducts.length > 0 && selectedIds.size === localProducts.length}
            onChange={(e) => setSelectedIds(e.target.checked ? new Set(localProducts.map((p) => p.id)) : new Set())}
          />
          <span>Выбрано {selectedIds.size} — выделенные перетаскиваются вместе</span>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                const name = window.prompt('Название группы для выбранных позиций', '');
                if (name !== null) commit(setCategory(localProducts, [...selectedIds], name));
              }}
              className="ml-2 underline text-[var(--fg)] cursor-pointer"
            >
              в группу…
            </button>
          )}
        </label>
        <div className="flex-1 overflow-auto">
          {localProducts.length === 0 ? (
            <div className="px-2 pt-4">
              <p className="text-[clamp(20px,1.8vw,26px)] font-medium leading-tight">Позиций пока нет</p>
              <p className="text-[13px] text-[var(--grey)] mt-1 max-w-[46ch]">Перетащи папку на доску и выбери «Продукты», или нажми «Папка с фото» / «Список CSV / JSON» выше. Фото с доски можно перетащить прямо на строку позиции.</p>
            </div>
          ) : (
            <table className="w-full text-[11px]" style={{ borderSpacing: '2px', borderCollapse: 'separate' }}>
              <tbody>
                {groups.map((g) => (
                  <React.Fragment key={g.title}>
                    {/* Group header: drop rows here to move them into the group; double-click renames */}
                    {(groups.length > 1 || g.title !== NO_GROUP) && (
                      <tr {...dropHandlers(`group:${g.title}`, (e) => dropOnGroup(e, g.title))}>
                        <td colSpan={shownCols + 3} className={`pt-3 ${dropKey === `group:${g.title}` ? 'bg-[var(--marker)]' : ''}`}>
                          <div className="ofst-run" onDoubleClick={() => g.title !== NO_GROUP && setRenamingGroup(g.title)}>
                            {renamingGroup === g.title ? (
                              <input
                                autoFocus
                                defaultValue={g.title}
                                onBlur={(e) => {
                                  commit(renameCategory(localProducts, g.title, e.target.value));
                                  setRenamingGroup(null);
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                className="!bg-transparent p-0 text-[12px] w-1/2"
                              />
                            ) : (
                              <span title="Двойной клик — переименовать. Перетащи сюда строки, чтобы перенести их в группу">{g.title}</span>
                            )}
                            <span className="tabular-nums">{g.rows.length}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                {g.rows.map(({ p: prod, index: idx }) => {
                  const variants = Array.from({ length: shownCols }, (_, i) => prod.variants?.[i] || null);
                  const finalIdx = prod.finalIndex ?? -1;
                  const dragIds = selectedIds.has(prod.id) ? [...selectedIds] : [prod.id];
                  return (
                    <tr
                      key={prod.id || idx}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(PRODUCT_DRAG_TYPE, JSON.stringify(dragIds));
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      data-position-id={prod.id}
                      className={`align-top ${selectedIds.has(prod.id) ? 'bg-[var(--marker)]/25' : ''}`}
                      title="Перетащи на доску (выделенные — все вместе)"
                    >
                      <td className="w-6 pt-0.5 text-[11px] text-[var(--grey)] tabular-nums">
                        {String(idx + 1).padStart(2, '0')}

                        <input
                          type="checkbox"
                          checked={selectedIds.has(prod.id)}
                          onChange={() =>
                            setSelectedIds((prev) => {
                              const n = new Set(prev);
                              if (n.has(prod.id)) n.delete(prod.id);
                              else n.add(prod.id);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td
                        className={`w-[104px] ${dropKey === `${prod.id}:-1` ? 'ofst-drop-target' : ''}`}
                        data-position-id={prod.id}
                        data-position-slot={-1}
                        {...dropHandlers(`${prod.id}:-1`, (e) => dropOnSlot(e, { id: prod.id, slot: -1 }))}
                      >
                        <Slot
                          src={prod.photoDataUrl}
                          label="Оригинал"
                          dragRef={{ id: prod.id, slot: -1 }}
                          isFinal={finalIdx === -1}
                          onPick={() => handleTriggerUpload(idx)}
                          onMarkFinal={() => setFinal(idx, -1)}
                        />
                      </td>
                      {variants.map((v, vi) => (
                        <td
                          key={vi}
                          className={`w-[104px] ${dropKey === `${prod.id}:${vi}` ? 'ofst-drop-target' : ''}`}
                          data-position-id={prod.id}
                          data-position-slot={vi}
                          {...dropHandlers(`${prod.id}:${vi}`, (e) => dropOnSlot(e, { id: prod.id, slot: vi }))}
                        >
                          <Slot
                            src={v || ''}
                            label={`Вариант ${vi + 1}`}
                            dragRef={{ id: prod.id, slot: vi }}
                            isFinal={finalIdx === vi}
                            onPick={() => triggerVariantUpload(idx, vi)}
                            onMarkFinal={() => setFinal(idx, vi)}
                          />
                        </td>
                      ))}
                      <td
                        className={`pl-1 min-w-[140px] ${dropKey === `row:${prod.id}` ? 'bg-[var(--marker)]' : ''}`}
                        title="Перетащи сюда другую строку — она станет ещё одним ракурсом этой позиции"
                        {...dropHandlers(`row:${prod.id}`, (e) => dropOnRow(e, prod.id))}
                      >
                        <input
                          type="text"
                          value={prod.name}
                          onChange={(e) => handleNameChange(idx, e.target.value)}
                          onBlur={() => commit(localProducts)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          className="w-full text-[13px] font-medium !bg-transparent py-0.5 focus:!bg-[var(--soft)]"
                        />
                        {!prod.photoDataUrl && <div className="mt-1 text-[11px]"><mark className="bg-[var(--marker)] px-0.5">нет фото</mark></div>}
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--grey)]">
                          <button onClick={() => handleDeleteRow(idx)} className="hover:bg-[var(--marker)] hover:text-[var(--fg)] cursor-pointer">удалить</button>
                          {prod.photoDataUrl && onAddProductToCanvas && (
                            <button onClick={() => onAddProductToCanvas(prod)} className="hover:text-[var(--fg)] cursor-pointer">на доску</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <input type="file" ref={variantInputRef} accept="image/*,.heic,.heif" className="hidden" onChange={handleVariantFile} />

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*,.heic,.heif"
          className="hidden"
        />

        {/* Image Crop Modal for Product Photo */}
        {cropModalState && (
          <ImageCropModal
            isOpen={cropModalState.isOpen}
            imageSrc={cropModalState.rawSrc}
            imageName={cropModalState.productName}
            initialAspectRatio="1:1"
            onSave={(croppedDataUrl) => handleSaveCroppedImage(croppedDataUrl)}
            onCancel={handleCancelCrop}
          />
        )}
      </div>
  );
};
