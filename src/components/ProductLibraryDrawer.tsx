import React, { useRef, useState, useEffect } from 'react';
import { X, Plus, Trash2, Upload, Image as ImageIcon, Save, Check, PlusCircle, Crop } from 'lucide-react';
import { ProductItem } from '../types';
import { compressImageDataUrl, loadGlobalProducts, saveGlobalProducts } from '../utils/storage';
import { ImageCropModal } from './ImageCropModal';
import { normalizeImageFiles, isImageFile } from '../utils/heic';

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

  const handleSave = () => {
    onSaveProducts(localProducts);
    saveGlobalProducts(localProducts);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 2000);
  };

  return (
    <div
      id="drawer-products-backdrop"
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="drawer-products-panel"
        style={{ width: '300px' }}
        className="h-full bg-white shadow-2xl flex flex-col border-l border-gray-200 animate-in slide-in-from-right duration-250 z-50 select-text"
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

        {/* Products Table / List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {localProducts.length === 0 ? (
            <div className="py-12 text-center text-gray-400 px-4">
              <ImageIcon className="w-8 h-8 mx-auto mb-2 text-gray-300 stroke-1" />
              <p className="text-xs font-medium text-gray-600">Библиотека пуста</p>
              <p className="text-[11px] text-gray-400 mt-1">
                Нажмите «Добавить позицию», чтобы добавить фото и название продукта
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {localProducts.map((prod, idx) => (
                <div
                  key={prod.id || idx}
                  className="bg-white border border-gray-200 rounded-xl p-2.5 shadow-2xs hover:border-gray-300 transition-all flex flex-col gap-2 group"
                >
                  <div className="flex items-center gap-2.5">
                    {/* Photo Box (50x50) */}
                    <div
                      onClick={() => handleTriggerUpload(idx)}
                      className="w-[50px] h-[50px] shrink-0 rounded-lg border border-dashed border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50 flex items-center justify-center cursor-pointer overflow-hidden relative group/img transition-all"
                      title="Кликните для загрузки фото"
                    >
                      {prod.photoDataUrl ? (
                        <>
                          <img
                            src={prod.photoDataUrl}
                            alt={prod.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Upload className="w-3.5 h-3.5" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-gray-400">
                          <Upload className="w-4 h-4" />
                          <span className="text-[9px] font-medium mt-0.5">Фото</span>
                        </div>
                      )}
                    </div>

                    {/* Name Input */}
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] font-medium text-gray-400 block mb-0.5 uppercase tracking-wider">
                        Название
                      </label>
                      <input
                        type="text"
                        value={prod.name}
                        onChange={(e) => handleNameChange(idx, e.target.value)}
                        placeholder="Название товара..."
                        className="w-full text-xs font-medium text-gray-800 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:bg-white focus:outline-none focus:border-blue-500 transition-all"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDeleteRow(idx)}
                        className="w-6 h-6 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md flex items-center justify-center transition-colors cursor-pointer"
                        title="Удалить позицию"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {prod.photoDataUrl && onAddProductToCanvas && (
                        <button
                          onClick={() => onAddProductToCanvas(prod)}
                          className="w-6 h-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md flex items-center justify-center transition-colors cursor-pointer"
                          title="Поместить на канвас как карточку"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
