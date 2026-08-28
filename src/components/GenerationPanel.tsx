import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Loader2,
  GripHorizontal,
  AlertCircle,
  Settings,
  Image as ImageIcon,
  StickyNote,
  Paperclip,
  MapPin,
  BookOpen,
  Package,
  Layers,
  CheckSquare,
  Square,
  Check,
} from 'lucide-react';
import { Card, MasterPrompt, Note, ProductItem } from '../types';

export interface ConsideredNoteInfo {
  id: string;
  text: string;
  isAttached: boolean;
  color: string;
  cardName?: string;
}

export interface GenerationOptions {
  isProductReplacement?: boolean;
  selectedProduct?: ProductItem;
}

interface GenerationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCards: Card[];
  consideredNotes: ConsideredNoteInfo[];
  onDeselectCard?: (cardId: string) => void;
  onGenerate: (prompt: string, options?: GenerationOptions) => Promise<void>;
  onGenerateBatch?: (
    prompt: string,
    selectedProductIds: string[],
    onProgress: (current: number, total: number, currentProductName: string) => void
  ) => Promise<number>;
  isGenerating: boolean;
  errorMessage: string | null;
  onClearError: () => void;
  onOpenSettings: () => void;
  masterPrompts?: MasterPrompt[];
  onOpenMasterPrompts?: () => void;
  currentPromptPreset?: string;
  products?: ProductItem[];
  onOpenProducts?: () => void;
}

export function GenerationPanel({
  isOpen,
  onClose,
  selectedCards,
  consideredNotes,
  onDeselectCard,
  onGenerate,
  onGenerateBatch,
  isGenerating,
  errorMessage,
  onClearError,
  onOpenSettings,
  masterPrompts = [],
  onOpenMasterPrompts,
  currentPromptPreset,
  products = [],
  onOpenProducts,
}: GenerationPanelProps) {
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [prompt, setPrompt] = useState('');
  const [selectedMasterPromptId, setSelectedMasterPromptId] = useState('');
  const [isProductReplacementMode, setIsProductReplacementMode] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedBatchProductIds, setSelectedBatchProductIds] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    productName: string;
  } | null>(null);

  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; panelX: number; panelY: number }>({
    mouseX: 0,
    mouseY: 0,
    panelX: 0,
    panelY: 0,
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Default selected product ID if list updates
  useEffect(() => {
    if (products.length > 0 && (!selectedProductId || !products.some((p) => p.id === selectedProductId))) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  // Sync external preset prompt if provided
  useEffect(() => {
    if (currentPromptPreset !== undefined && currentPromptPreset !== '') {
      setPrompt(currentPromptPreset);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(140, Math.max(60, textareaRef.current.scrollHeight))}px`;
      }
    }
  }, [currentPromptPreset]);

  // Initialize desktop position on open
  useEffect(() => {
    if (isOpen && position === null && window.innerWidth >= 640) {
      const panelWidth = 420;
      const left = Math.max(20, (window.innerWidth - panelWidth) / 2);
      const top = Math.max(80, window.innerHeight - 440);
      setPosition({ x: left, y: top });
    }
  }, [isOpen, position]);

  // Adjust textarea height on change
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(140, Math.max(60, textareaRef.current.scrollHeight))}px`;
    }
  };

  const handleMasterPromptSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const promptId = e.target.value;
    setSelectedMasterPromptId(promptId);
    if (!promptId) {
      setPrompt('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '60px';
      }
      return;
    }
    const found = masterPrompts.find((p) => p.id === promptId);
    if (found) {
      setPrompt(found.prompt);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.style.height = `${Math.min(140, Math.max(60, textareaRef.current.scrollHeight))}px`;
          }
        }, 0);
      }
    }
  };

  // Dragging logic for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if (window.innerWidth < 640) return; // Disabled on mobile bottom sheet
    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('textarea') ||
      (e.target as HTMLElement).closest('input') ||
      (e.target as HTMLElement).closest('select')
    ) {
      return;
    }
    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panelX: position?.x || (window.innerWidth - 420) / 2,
      panelY: position?.y || window.innerHeight - 440,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = ev.clientX - dragStartRef.current.mouseX;
      const dy = ev.clientY - dragStartRef.current.mouseY;
      const newX = Math.max(10, Math.min(window.innerWidth - 400, dragStartRef.current.panelX + dx));
      const newY = Math.max(60, Math.min(window.innerHeight - 120, dragStartRef.current.panelY + dy));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Batch Selection Helpers
  const handleToggleBatchProduct = (productId: string) => {
    setSelectedBatchProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        if (next.size >= 10) {
          window.alert('Максимум 10 продуктов за раз');
          return prev;
        }
        next.add(productId);
      }
      return next;
    });
  };

  const handleSelectAllBatch = () => {
    const ids = products.slice(0, 10).map((p) => p.id);
    if (products.length > 10) {
      window.alert('Выбраны первые 10 продуктов (максимум за один пакет)');
    }
    setSelectedBatchProductIds(new Set(ids));
  };

  const handleDeselectAllBatch = () => {
    setSelectedBatchProductIds(new Set());
  };

  if (!isOpen) return null;

  // Single Generation Submit
  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) return;

    if (isProductReplacementMode) {
      if (products.length === 0) {
        window.alert('Добавьте продукты в библиотеку (кнопка Продукты)');
        return;
      }
      const selectedProd = products.find((p) => p.id === selectedProductId) || products[0];
      if (!selectedProd || !selectedProd.photoDataUrl) {
        window.alert('У выбранного продукта нет фото');
        return;
      }
      onGenerate(prompt, {
        isProductReplacement: true,
        selectedProduct: selectedProd,
      });
    } else {
      onGenerate(prompt, {
        isProductReplacement: false,
      });
    }
  };

  // Batch Generation Submit
  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) return;

    if (selectedBatchProductIds.size < 2) {
      window.alert('Выберите минимум 2 продукта');
      return;
    }

    if (selectedBatchProductIds.size > 10) {
      window.alert('Максимум 10 продуктов за раз');
      return;
    }

    // Validate that all selected products have photoDataUrl
    for (const prodId of selectedBatchProductIds) {
      const prod = products.find((p) => p.id === prodId);
      if (!prod || !prod.photoDataUrl) {
        window.alert(`У продукта "${prod?.name || 'Без названия'}" нет фото. Добавьте фото в библиотеке.`);
        return;
      }
    }

    if (!onGenerateBatch) {
      window.alert('Функция пакетной генерации недоступна');
      return;
    }

    try {
      setBatchProgress({ current: 1, total: selectedBatchProductIds.size, productName: '' });
      const generatedCount = await onGenerateBatch(
        prompt,
        Array.from(selectedBatchProductIds),
        (current, total, currentProductName) => {
          setBatchProgress({ current, total, productName: currentProductName });
        }
      );
      setBatchProgress(null);
      window.alert(`Готово: сгенерировано ${generatedCount} изображений`);
    } catch (err) {
      setBatchProgress(null);
      // error is handled by App.tsx through setGenerationError
    }
  };

  const samplePrompts = [
    'На деревянном подиуме с мягким студийным светом',
    'Премиальный мраморный фон с отражением',
    'Ботанические листья и капли утренней росы',
    'Чистый минималистичный белый фон с мягкими тенями',
  ];

  return (
    <>
      {/* Mobile Backdrop for bottom sheet */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/30 backdrop-blur-xs z-40 sm:hidden animate-in fade-in duration-150"
      />

      <div
        ref={panelRef}
        id="generation-floating-panel"
        style={
          window.innerWidth >= 640 && position
            ? { left: `${position.x}px`, top: `${position.y}px`, bottom: 'auto' }
            : {}
        }
        className={`fixed z-50 bg-white border border-gray-200 shadow-2xl text-gray-800 transition-[box-shadow]
          /* Mobile style: bottom sheet occupying lower half */
          inset-x-0 bottom-0 max-h-[75vh] sm:max-h-[85vh] w-full rounded-t-2xl rounded-b-none border-t border-gray-200 overflow-y-auto
          /* Desktop style: 420px floating window */
          sm:inset-x-auto sm:w-[420px] sm:rounded-2xl sm:overflow-hidden sm:border
        `}
      >
        {/* Header - Drag handle on desktop, bottom sheet grab bar on mobile */}
        <div
          onMouseDown={handleMouseDown}
          className="sticky top-0 z-10 px-4 py-2.5 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 flex items-center justify-between cursor-default sm:cursor-move select-none"
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="hidden sm:block w-4 h-4 text-gray-400" />
            <div className="w-6 h-6 rounded-md bg-purple-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xs sm:text-sm font-semibold text-gray-900 tracking-tight">
              AI Генерация фото
            </h3>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-lg transition-colors cursor-pointer"
              title="Настройки API"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-lg transition-colors cursor-pointer"
              title="Закрыть панель (G)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mode Tabs: Single vs Batch */}
        <div className="px-3.5 pt-2.5 bg-gray-50/50 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-200/70 rounded-xl">
            <button
              type="button"
              id="tab-single-generation"
              onClick={() => setActiveTab('single')}
              className={`py-1.5 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'single'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/40'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>Одиночная</span>
            </button>

            <button
              type="button"
              id="tab-batch-generation"
              onClick={() => setActiveTab('batch')}
              className={`py-1.5 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'batch'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/40'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Пакетная генерация</span>
              {selectedBatchProductIds.size > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 bg-blue-100 text-blue-700 font-bold text-[10px] rounded-full">
                  {selectedBatchProductIds.size}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-3.5 mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start justify-between gap-2 text-xs text-red-700">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Внимание: </span>
                <span>{errorMessage}</span>
                {errorMessage.includes('API-ключ') && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="ml-1 font-semibold underline hover:text-red-900"
                  >
                    Настройки
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClearError}
              className="p-0.5 text-red-400 hover:text-red-700 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Batch Progress Indicator Banner */}
        {isGenerating && batchProgress && (
          <div className="mx-3.5 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1.5 animate-in fade-in">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                <span>Генерация: {batchProgress.current} из {batchProgress.total}...</span>
              </div>
              <span className="text-[11px] text-blue-700">
                {Math.round((batchProgress.current / batchProgress.total) * 100)}%
              </span>
            </div>
            {batchProgress.productName && (
              <div className="text-[11px] text-blue-700 truncate">
                Товар: <span className="font-medium">{batchProgress.productName}</span>
              </div>
            )}
            <div className="w-full bg-blue-200/80 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* TAB 1: SINGLE GENERATION */}
        {activeTab === 'single' && (
          <form onSubmit={handleSingleSubmit} className="p-3.5 sm:p-4 space-y-3">
            {/* Selected References Thumbnails Bar */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1 text-gray-500">
                <span className="font-semibold text-gray-700">
                  Референсы ({selectedCards.length}/5):
                </span>
                <span className="text-gray-400 text-[10px]">
                  {selectedCards.length === 0 ? 'Выберите на канвасе' : 'Стиль будет перенесен'}
                </span>
              </div>

              {selectedCards.length === 0 ? (
                <div className="py-2.5 px-3 bg-gray-50 border border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-2 text-xs text-gray-500">
                  <ImageIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-[11px]">Кликните по карточкам на канвасе</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 bg-gray-50 border border-gray-200 rounded-xl custom-scrollbar">
                  {selectedCards.slice(0, 5).map((card, idx) => (
                    <div
                      key={card.id}
                      className="relative group shrink-0 w-12 h-12 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs"
                    >
                      <img
                        src={card.src}
                        alt={card.name || `Ref ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        {onDeselectCard && (
                          <button
                            type="button"
                            onClick={() => onDeselectCard(card.id)}
                            className="p-1 bg-red-500 text-white rounded-full hover:bg-red-600 cursor-pointer"
                            title="Убрать"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {selectedCards.length > 5 && (
                    <div className="shrink-0 w-12 h-12 bg-gray-200 rounded-lg border border-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600">
                      +{selectedCards.length - 5}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Considered Sticky Notes Section */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <div className="flex items-center gap-1 font-semibold text-gray-700">
                  <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                  <span>Учтённые заметки:</span>
                </div>
                <span className="text-[10px] text-gray-400">
                  {consideredNotes.length > 0
                    ? `${consideredNotes.length} шт. (прикреплённые и рядом)`
                    : 'Автосбор с канваса'}
                </span>
              </div>

              {consideredNotes.length === 0 ? (
                <div className="py-2 px-3 bg-amber-50/50 border border-amber-200/60 rounded-xl flex items-center gap-2 text-xs text-amber-700/80">
                  <span className="text-amber-500">ℹ️</span>
                  <span className="text-[11px]">
                    Нет заметок (создайте двойным кликом на канвасе)
                  </span>
                </div>
              ) : (
                <div className="max-h-24 overflow-y-auto space-y-1.5 p-1.5 bg-gray-50 border border-gray-200 rounded-xl custom-scrollbar">
                  {consideredNotes.map((note) => {
                    const bgClass =
                      note.color === 'yellow'
                        ? 'bg-yellow-100/90 text-yellow-900 border-yellow-300'
                        : note.color === 'pink'
                        ? 'bg-pink-100/90 text-pink-900 border-pink-300'
                        : note.color === 'blue'
                        ? 'bg-sky-100/90 text-sky-900 border-sky-300'
                        : note.color === 'green'
                        ? 'bg-emerald-100/90 text-emerald-900 border-emerald-300'
                        : 'bg-white text-gray-800 border-gray-200';

                    return (
                      <div
                        key={note.id}
                        className={`p-2 rounded-lg border text-xs flex items-start justify-between gap-2 shadow-2xs ${bgClass}`}
                      >
                        <div className="flex items-start gap-1.5 flex-1 min-w-0">
                          {note.isAttached ? (
                            <Paperclip className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-600" />
                          ) : (
                            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                          )}
                          <span className="break-words font-medium leading-tight">
                            {note.text || '(Пустая заметка)'}
                          </span>
                        </div>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-black/5 shrink-0">
                          {note.isAttached ? 'Прикреплена' : 'Рядом'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Product Replacement Mode Toggle & Selector */}
            <div
              className={`p-2.5 rounded-xl border transition-all ${
                isProductReplacementMode
                  ? 'bg-blue-50/80 border-blue-200'
                  : 'bg-gray-50/70 border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="toggle-product-replacement-mode"
                    checked={isProductReplacementMode}
                    onChange={(e) => setIsProductReplacementMode(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-gray-800">
                    <Package className="w-3.5 h-3.5 text-blue-600" />
                    <span>Режим замены продукта</span>
                  </div>
                </label>
                {isProductReplacementMode && onOpenProducts && (
                  <button
                    type="button"
                    onClick={onOpenProducts}
                    className="text-[10px] text-blue-600 hover:text-blue-800 underline font-medium cursor-pointer"
                  >
                    Библиотека
                  </button>
                )}
              </div>

              {isProductReplacementMode && (
                <div className="mt-2 pt-2 border-t border-blue-100 space-y-1.5 animate-in fade-in duration-150">
                  {products.length === 0 ? (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between gap-2">
                      <span className="text-[11px]">
                        Добавьте продукты в библиотеку (кнопка Продукты)
                      </span>
                      {onOpenProducts && (
                        <button
                          type="button"
                          onClick={onOpenProducts}
                          className="px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-medium hover:bg-amber-700 shrink-0 cursor-pointer"
                        >
                          Добавить
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        id="gen-product-select"
                        value={selectedProductId}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-blue-200 rounded-lg text-gray-800 focus:outline-none focus:border-blue-500"
                      >
                        {products.map((prod) => (
                          <option key={prod.id} value={prod.id}>
                            {prod.name || 'Без названия'}
                          </option>
                        ))}
                      </select>

                      {/* Mini preview thumbnail of chosen product */}
                      {(() => {
                        const currentProd = products.find((p) => p.id === selectedProductId);
                        if (currentProd?.photoDataUrl) {
                          return (
                            <div
                              className="w-8 h-8 rounded-md border border-blue-200 overflow-hidden bg-white shrink-0 shadow-2xs"
                              title={currentProd.name}
                            >
                              <img
                                src={currentProd.photoDataUrl}
                                alt={currentProd.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Master Prompt Selector */}
            <div className="space-y-1 bg-purple-50/60 p-2 rounded-xl border border-purple-100">
              <div className="flex items-center justify-between text-[11px]">
                <label
                  htmlFor="gen-master-prompt-select"
                  className="flex items-center gap-1 font-semibold text-purple-900"
                >
                  <BookOpen className="w-3.5 h-3.5 text-purple-600" />
                  <span>Мастер-промпт:</span>
                </label>
                {onOpenMasterPrompts && (
                  <button
                    type="button"
                    onClick={onOpenMasterPrompts}
                    className="text-purple-600 hover:text-purple-800 text-[10px] font-medium underline cursor-pointer"
                  >
                    Управление
                  </button>
                )}
              </div>
              <select
                id="gen-master-prompt-select"
                value={selectedMasterPromptId}
                onChange={handleMasterPromptSelect}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-purple-200 rounded-lg text-gray-800 focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="">— Выберите мастер-промпт (или введите свой) —</option>
                {masterPrompts.map((mp) => (
                  <option key={mp.id} value={mp.id}>
                    {mp.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Prompt Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="gen-prompt-input" className="block text-xs font-semibold text-gray-700">
                  Описание сцены (промпт)
                </label>
                {prompt && (
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt('');
                      setSelectedMasterPromptId('');
                    }}
                    className="text-[10px] text-gray-400 hover:text-red-500 cursor-pointer"
                  >
                    Очистить
                  </button>
                )}
              </div>
              <textarea
                ref={textareaRef}
                id="gen-prompt-input"
                rows={2}
                value={prompt}
                onChange={handlePromptChange}
                placeholder="Опишите желаемую сцену, окружение или освещение..."
                className="w-full p-2.5 text-xs bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-colors resize-none leading-relaxed"
              />
            </div>

            {/* Prompt presets / pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-[10px]">
              <span className="text-gray-400 shrink-0 font-medium">Идеи:</span>
              {samplePrompts.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setPrompt(p);
                    if (textareaRef.current) {
                      textareaRef.current.style.height = 'auto';
                    }
                  }}
                  className="px-2 py-1 bg-gray-100 hover:bg-purple-50 hover:text-purple-700 text-gray-600 rounded-full border border-gray-200 shrink-0 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {p.slice(0, 24)}...
                </button>
              ))}
            </div>

            {/* Footer & Submit Button */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
              <span className="hidden sm:inline text-[10px] text-gray-400">
                Горячая клавиша: <kbd className="px-1 py-0.5 bg-gray-100 border rounded font-mono">G</kbd>
              </span>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  Закрыть
                </button>

                <button
                  type="submit"
                  id="btn-trigger-generate"
                  disabled={isGenerating}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                    isGenerating
                      ? 'bg-purple-400 text-white cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Генерация...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Сгенерировать</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* TAB 2: BATCH GENERATION */}
        {activeTab === 'batch' && (
          <form onSubmit={handleBatchSubmit} className="p-3.5 sm:p-4 space-y-3">
            {/* Batch Info Header */}
            <div className="flex items-center justify-between text-xs">
              <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>Продукты для пакета:</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllBatch}
                  className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                >
                  Выбрать все
                </button>
                <span className="text-gray-300">•</span>
                <button
                  type="button"
                  onClick={handleDeselectAllBatch}
                  className="text-[11px] text-gray-500 hover:text-gray-800 font-medium cursor-pointer"
                >
                  Снять все
                </button>
              </div>
            </div>

            {/* Product Checkboxes List */}
            {products.length === 0 ? (
              <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded-xl text-center space-y-2">
                <Package className="w-6 h-6 text-gray-400 mx-auto" />
                <p className="text-xs text-gray-600">
                  В библиотеке нет продуктов. Добавьте товары с фото для пакетной генерации.
                </p>
                {onOpenProducts && (
                  <button
                    type="button"
                    onClick={onOpenProducts}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
                  >
                    Открыть библиотеку продуктов
                  </button>
                )}
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto space-y-1.5 p-1 bg-gray-50/80 border border-gray-200 rounded-xl custom-scrollbar">
                {products.map((prod) => {
                  const isSelected = selectedBatchProductIds.has(prod.id);
                  const hasPhoto = Boolean(prod.photoDataUrl);

                  return (
                    <label
                      key={prod.id}
                      className={`flex items-center justify-between gap-2.5 p-2 rounded-lg border transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300 shadow-2xs'
                          : 'bg-white border-gray-200 hover:bg-gray-100/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleBatchProduct(prod.id)}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer shrink-0"
                        />

                        {/* Thumbnail */}
                        <div className="w-8 h-8 rounded-md border border-gray-200 bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                          {hasPhoto ? (
                            <img
                              src={prod.photoDataUrl}
                              alt={prod.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
                          )}
                        </div>

                        {/* Name */}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-900 truncate">
                            {prod.name || 'Без названия'}
                          </div>
                          {!hasPhoto && (
                            <span className="text-[10px] text-amber-600 font-medium">
                              Нет фото (генерация невозможна)
                            </span>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <span className="text-[10px] font-bold text-blue-600 px-1.5 py-0.5 bg-blue-100/80 rounded-full shrink-0">
                          В пакете
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {/* Selection Status Badge */}
            <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
              <span>
                Выбрано:{' '}
                <strong className={selectedBatchProductIds.size >= 2 ? 'text-blue-600' : 'text-gray-700'}>
                  {selectedBatchProductIds.size}
                </strong>{' '}
                из {products.length} (мин. 2, макс. 10)
              </span>
              {selectedBatchProductIds.size < 2 && (
                <span className="text-amber-600 text-[10px] font-medium">
                  Нужно минимум 2
                </span>
              )}
            </div>

            {/* References preview (transferred style) */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1 text-gray-500">
                <span className="font-semibold text-gray-700">
                  Стиль референсов ({selectedCards.length}/5):
                </span>
                <span className="text-gray-400 text-[10px]">
                  {selectedCards.length === 0 ? 'Без референсов' : 'Единый стиль для всех'}
                </span>
              </div>

              {selectedCards.length === 0 ? (
                <div className="py-2 px-3 bg-gray-50 border border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-2 text-xs text-gray-500">
                  <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[11px]">Кликните по референсам на канвасе для переноса стиля</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 bg-gray-50 border border-gray-200 rounded-xl custom-scrollbar">
                  {selectedCards.slice(0, 5).map((card, idx) => (
                    <div
                      key={card.id}
                      className="relative group shrink-0 w-10 h-10 bg-white rounded-md border border-gray-200 overflow-hidden shadow-xs"
                    >
                      <img
                        src={card.src}
                        alt={card.name || `Ref ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        {onDeselectCard && (
                          <button
                            type="button"
                            onClick={() => onDeselectCard(card.id)}
                            className="p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600 cursor-pointer"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Master Prompt Selector */}
            <div className="space-y-1 bg-purple-50/60 p-2 rounded-xl border border-purple-100">
              <div className="flex items-center justify-between text-[11px]">
                <label
                  htmlFor="gen-batch-master-prompt"
                  className="flex items-center gap-1 font-semibold text-purple-900"
                >
                  <BookOpen className="w-3.5 h-3.5 text-purple-600" />
                  <span>Мастер-промпт (общий для всех):</span>
                </label>
                {onOpenMasterPrompts && (
                  <button
                    type="button"
                    onClick={onOpenMasterPrompts}
                    className="text-purple-600 hover:text-purple-800 text-[10px] font-medium underline cursor-pointer"
                  >
                    Управление
                  </button>
                )}
              </div>
              <select
                id="gen-batch-master-prompt"
                value={selectedMasterPromptId}
                onChange={handleMasterPromptSelect}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-purple-200 rounded-lg text-gray-800 focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="">— Выберите мастер-промпт (или введите свой) —</option>
                {masterPrompts.map((mp) => (
                  <option key={mp.id} value={mp.id}>
                    {mp.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Prompt Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="gen-batch-prompt-input" className="block text-xs font-semibold text-gray-700">
                  Общий промпт для всех продуктов
                </label>
                {prompt && (
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt('');
                      setSelectedMasterPromptId('');
                    }}
                    className="text-[10px] text-gray-400 hover:text-red-500 cursor-pointer"
                  >
                    Очистить
                  </button>
                )}
              </div>
              <textarea
                ref={textareaRef}
                id="gen-batch-prompt-input"
                rows={2}
                value={prompt}
                onChange={handlePromptChange}
                placeholder="Общее окружение, свет, фон для всех выбранных продуктов..."
                className="w-full p-2.5 text-xs bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-colors resize-none leading-relaxed"
              />
            </div>

            {/* Footer & Submit Batch Button */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
              <span className="hidden sm:inline text-[10px] text-gray-400">
                Лимит: 10 шт. за раз
              </span>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  Закрыть
                </button>

                <button
                  type="submit"
                  id="btn-trigger-batch-generate"
                  disabled={isGenerating || selectedBatchProductIds.size < 2 || products.length === 0}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                    isGenerating
                      ? 'bg-blue-400 text-white cursor-not-allowed'
                      : selectedBatchProductIds.size < 2 || products.length === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        {batchProgress
                          ? `Генерация: ${batchProgress.current} из ${batchProgress.total}...`
                          : 'Генерация пакета...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Layers className="w-3.5 h-3.5" />
                      <span>
                        Сгенерировать пакет{' '}
                        {selectedBatchProductIds.size > 0 ? `(${selectedBatchProductIds.size})` : ''}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
