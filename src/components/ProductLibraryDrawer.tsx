import React, { useRef, useState, useEffect } from 'react';
import { X, Plus, Trash2, Upload, Image as ImageIcon, Save, Check, PlusCircle, Crop } from 'lucide-react';
import { ProductItem } from '../types';
import { compressImageDataUrl, loadGlobalProducts, saveGlobalProducts } from '../utils/storage';
import { ImageCropModal } from './ImageCropModal';
import { normalizeImageFiles, isImageFile } from '../utils/heic';
import { PRODUCT_DRAG_TYPE } from '../utils/dragTypes';

/** One square photo slot in the positions table; ★ marks the final photo of the row. */
const Slot: React.FC<{ src: string; label: string; isFinal: boolean; onPick: () => void; onMarkFinal: () => void }> = ({
  src,
  label,
  isFinal,
  onPick,
  onMarkFinal,
}) => (
  <div className={`relative w-[104px] h-[104px] border ${isFinal && src ? 'border-2 border-gray-900' : 'border-gray-200'} bg-gray-50 group/slot`}>
    {src ? (
      <img src={src} alt={label} className="w-full h-full object-cover" draggable={false} />
    ) : (
      <button onClick={onPick} className="w-full h-full text-[10px] text-gray-400 hover:text-gray-900 cursor-pointer" title={`Загрузить: ${label}`}>
        + {label}
      </button>
    )}
    {src && (
      <>
        <button
          onClick={onMarkFinal}
          className={`absolute top-0 left-0 px-1 text-[11px] leading-4 cursor-pointer ${isFinal ? 'bg-yellow-300 text-gray-900' : 'bg-white/80 text-gray-400 opacity-0 group-hover/slot:opacity-100'}`}
          title="Сделать финальным фото позиции"
        >
          ★
        </button>
        <button
          onClick={onPick}
          className="absolute bottom-0 right-0 px-1 text-[10px] bg-white/80 text-gray-600 opacity-0 group-hover/slot:opacity-100 cursor-pointer"
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
}

export const ProductLibraryDrawer: React.FC<ProductLibraryDrawerProps> = ({
  isOpen,
  onClose,
  products,
  onSaveProducts,
  onAddProductToCanvas,
}) => {
  const [localProducts, setLocalProducts] = useState<ProductItem[]>(products || []);
  const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
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

  const handleAddRow = () => {
    const newItem: ProductItem = {
      id: `prod_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: `Продукт ${localProducts.length + 1}`,
      photoDataUrl: '',
    };
    setLocalProducts((prev) => [...prev, newItem]);
  };

  const handleNameChange = (index: number, newName: string) => {
    setLocalProducts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name: newName };
      return updated;
    });
  };

  const handleDeleteRow = (index: number) => {
    setLocalProducts((prev) => prev.filter((_, i) => i !== index));
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

  const handleSave = () => {
    onSaveProducts(localProducts);
    saveGlobalProducts(localProducts);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 2000);
  };

  return (
    <div id="drawer-products-backdrop" className="fixed top-14 right-0 bottom-0 z-40 flex justify-end pointer-events-none">
      <div
        id="drawer-products-panel"
        style={{ width: 'min(640px, 100vw)' }}
        className="h-full bg-white shadow-2xl flex flex-col border-l border-gray-900 z-50 select-text pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-2xs">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 leading-tight">
                Библиотека продуктов
              </h2>
              <p className="text-[11px] text-gray-500">Позиции проекта ({localProducts.length})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="p-3 border-b border-gray-100 bg-white">
          <button
            onClick={handleAddRow}
            className="w-full py-2 px-3 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить позицию</span>
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => folderBatchRef.current?.click()}
              className="py-1.5 px-2 text-[11px] font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg cursor-pointer"
              title="Каждое фото станет позицией, название — из имени файла. Если позиция с таким названием уже есть, к ней добавится фото."
            >
              Папка с фото
            </button>
            <button
              onClick={() => listBatchRef.current?.click()}
              className="py-1.5 px-2 text-[11px] font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg cursor-pointer"
              title="CSV, JSON или TXT: берётся колонка name (или первая колонка / каждая строка)"
            >
              Список CSV / JSON
            </button>
          </div>
          {batchNote && <p className="mt-2 text-[10px] text-gray-500 leading-snug">{batchNote}</p>}
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
        </div>

        {/* Positions table: original | variants (one column each, + adds a column) | final = the one marked ★ */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 text-[11px]">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={localProducts.length > 0 && selectedIds.size === localProducts.length}
              onChange={(e) => setSelectedIds(e.target.checked ? new Set(localProducts.map((p) => p.id)) : new Set())}
            />
            <span>Выбрано {selectedIds.size}</span>
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Колонок вариантов: {variantCols}</span>
            <button
              className="px-2 py-1 border border-gray-900 hover:bg-gray-900 hover:text-white cursor-pointer"
              onClick={() => changeVariantCols(variantCols + 1)}
              title="Добавить колонку вариантов"
            >
              +
            </button>
            {variantCols > 0 && (
              <button
                className="px-2 py-1 border border-gray-300 hover:border-gray-900 cursor-pointer"
                onClick={() => changeVariantCols(variantCols - 1)}
                title="Убрать последнюю пустую колонку"
              >
                −
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {localProducts.length === 0 ? (
            <div className="py-12 text-center text-gray-400 px-4">
              <p className="text-xs font-medium text-gray-600">Библиотека пуста</p>
              <p className="text-[11px] text-gray-400 mt-1">Перетащи папку на доску → «Продукты», или «Папка с фото» / «Список CSV» выше</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <tbody>
                {localProducts.map((prod, idx) => {
                  const variants = Array.from({ length: variantCols }, (_, i) => prod.variants?.[i] || null);
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
                      className={`border-b border-gray-200 align-top ${selectedIds.has(prod.id) ? 'bg-yellow-50' : ''}`}
                      title="Перетащи на доску (выделенные — все вместе)"
                    >
                      <td className="p-1 w-6">
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
                      <td className="p-1 w-[112px]">
                        <Slot
                          src={prod.photoDataUrl}
                          label="Оригинал"
                          isFinal={finalIdx === -1}
                          onPick={() => handleTriggerUpload(idx)}
                          onMarkFinal={() => setFinal(idx, -1)}
                        />
                      </td>
                      {variants.map((v, vi) => (
                        <td key={vi} className="p-1 w-[112px]">
                          <Slot
                            src={v || ''}
                            label={`Вариант ${vi + 1}`}
                            isFinal={finalIdx === vi}
                            onPick={() => triggerVariantUpload(idx, vi)}
                            onMarkFinal={() => setFinal(idx, vi)}
                          />
                        </td>
                      ))}
                      <td className="p-1 min-w-[140px]">
                        <input
                          type="text"
                          value={prod.name}
                          onChange={(e) => handleNameChange(idx, e.target.value)}
                          className="w-full text-xs font-semibold text-gray-900 bg-transparent border-b border-transparent focus:border-gray-900 focus:outline-none py-0.5"
                        />
                        {prod.category && <div className="text-[10px] text-gray-400 mt-0.5">{prod.category}</div>}
                        {!prod.photoDataUrl && <div className="mt-1 inline-block bg-yellow-300 px-1 text-[10px]">нет фото</div>}
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
                          <button onClick={() => handleDeleteRow(idx)} className="hover:text-red-600 cursor-pointer">удалить</button>
                          {prod.photoDataUrl && onAddProductToCanvas && (
                            <button onClick={() => onAddProductToCanvas(prod)} className="hover:text-gray-900 cursor-pointer">на доску</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <input type="file" ref={variantInputRef} accept="image/*,.heic,.heif" className="hidden" onChange={handleVariantFile} />

        {/* Footer: Save Button */}
        <div className="p-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleSave}
            className={`w-full py-2 px-3 text-xs font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer ${
              saveSuccess
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {saveSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Сохранено!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Сохранить</span>
              </>
            )}
          </button>
        </div>

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
    </div>
  );
};
