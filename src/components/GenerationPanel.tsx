import React, { useState, useRef, useEffect } from 'react';
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
  masterPromptName?: string;
  /** What the selected photos are: the product to keep, or an example of the style to copy */
  photoRole?: 'product' | 'style';
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
  const [photoRole, setPhotoRole] = useState<'product' | 'style'>('product');
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

  // Name of the master prompt the text came from (only if it wasn't edited away entirely)
  const usedMasterPromptName = () => {
    const mp = masterPrompts.find((p) => p.id === selectedMasterPromptId);
    if (!mp) return undefined;
    return prompt.includes(mp.prompt.slice(0, 40)) ? mp.name : `${mp.name} (изменён)`;
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
        masterPromptName: usedMasterPromptName(),
      });
    } else {
      onGenerate(prompt, {
        isProductReplacement: false,
        masterPromptName: usedMasterPromptName(),
        photoRole,
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

  // Small shared pieces, so both tabs look the same
  const thumbs = (size: string) =>
    selectedCards.length === 0 ? (
      <p className="text-[12px] text-[var(--grey)] py-1">Выдели на доске 1–5 фото (Shift+клик или рамкой)</p>
    ) : (
      <div className="flex gap-0.5 overflow-x-auto custom-scrollbar">
        {selectedCards.slice(0, 5).map((card, idx) => (
          <div key={card.id} className={`relative group shrink-0 ${size} bg-[var(--soft)]`}>
            <img src={card.src} alt={card.name || `Ref ${idx + 1}`} className="w-full h-full object-cover" />
            {onDeselectCard && (
              <button
                type="button"
                onClick={() => onDeselectCard(card.id)}
                className="absolute top-0 right-0 hidden group-hover:block bg-white px-1 text-[11px] leading-4 hover:bg-[var(--marker)] cursor-pointer"
                title="Убрать из выделения"
              >
                убрать
              </button>
            )}
          </div>
        ))}
        {selectedCards.length > 5 && (
          <div className={`shrink-0 ${size} bg-[var(--soft)] flex items-center justify-center text-[12px]`}>
            +{selectedCards.length - 5}
          </div>
        )}
      </div>
    );

  const masterSelect = (id: string, label: string) => (
    <div>
      <div className="ofst-run mb-1">
        <label htmlFor={id}>{label}</label>
        {onOpenMasterPrompts && (
          <button type="button" onClick={onOpenMasterPrompts} className="hover:text-[var(--fg)] cursor-pointer">
            все промпты
          </button>
        )}
      </div>
      <select id={id} value={selectedMasterPromptId} onChange={handleMasterPromptSelect} className="w-full h-8 px-2 text-[13px]">
        <option value="">— без мастер-промпта —</option>
        {masterPrompts.map((mp) => (
          <option key={mp.id} value={mp.id}>
            {mp.name}
          </option>
        ))}
      </select>
    </div>
  );

  const promptBox = (id: string, label: string, placeholder: string) => (
    <div>
      <div className="ofst-run mb-1">
        <label htmlFor={id}>{label}</label>
        {prompt && (
          <button
            type="button"
            onClick={() => {
              setPrompt('');
              setSelectedMasterPromptId('');
            }}
            className="hover:text-[var(--fg)] cursor-pointer"
          >
            очистить
          </button>
        )}
      </div>
      <textarea
        ref={textareaRef}
        id={id}
        rows={3}
        value={prompt}
        onChange={handlePromptChange}
        placeholder={placeholder}
        className="w-full p-2 text-[13px] resize-none leading-snug"
      />
    </div>
  );

  return (
    <>
      {/* Mobile backdrop for the bottom sheet */}
      <div onClick={onClose} className="fixed inset-0 bg-black/30 z-40 sm:hidden" />

      {/* Docked on the right under the top bar (desktop), bottom sheet on phones */}
      <div
        ref={panelRef}
        id="generation-floating-panel"
        className="fixed z-50 bg-white text-[var(--fg)] inset-x-0 bottom-0 max-h-[75vh] w-full overflow-y-auto custom-scrollbar
          sm:inset-x-auto sm:right-0 sm:top-10 sm:bottom-0 sm:max-h-none sm:w-[400px]"
      >
        <div className="sticky top-0 z-10 bg-white px-2 pt-2 select-none">
          <div className="ofst-run">
            <span>AI генерация</span>
            <span className="flex gap-3">
              <button type="button" onClick={onOpenSettings} className="hover:text-[var(--fg)] cursor-pointer" title="Настройки API">
                настройки
              </button>
              <button type="button" onClick={onClose} className="hover:text-[var(--fg)] cursor-pointer" title="Закрыть панель (G)">
                закрыть
              </button>
            </span>
          </div>
          <div className="flex pt-0.5">
            <button
              type="button"
              id="tab-single-generation"
              onClick={() => setActiveTab('single')}
              className={`ofst-cell ${activeTab === 'single' ? 'is-on' : ''}`}
            >
              Одно фото
            </button>
            <button
              type="button"
              id="tab-batch-generation"
              onClick={() => setActiveTab('batch')}
              className={`ofst-cell ${activeTab === 'batch' ? 'is-on' : ''}`}
            >
              Пачкой{selectedBatchProductIds.size > 0 ? ` (${selectedBatchProductIds.size})` : ''}
            </button>
          </div>
        </div>

        {/* Error: yellow marker line, no box */}
        {errorMessage && (
          <div className="mx-2 mt-2 p-2 bg-[var(--marker)] text-[13px] leading-snug flex items-start justify-between gap-2">
            <span>
              {errorMessage}
              {errorMessage.includes('API-ключ') && (
                <button type="button" onClick={onOpenSettings} className="ml-1 underline cursor-pointer">
                  Настройки
                </button>
              )}
            </span>
            <button type="button" onClick={onClearError} className="shrink-0 underline cursor-pointer">
              ок
            </button>
          </div>
        )}

        {/* Batch progress: a line that fills */}
        {isGenerating && batchProgress && (
          <div className="mx-2 mt-2">
            <div className="ofst-run">
              <span>
                Генерация {batchProgress.current} из {batchProgress.total}
                {batchProgress.productName ? ` · ${batchProgress.productName}` : ''}
              </span>
              <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
            </div>
            <div className="h-1 bg-[var(--soft)]">
              <div className="h-full bg-[var(--fg)] transition-all duration-300" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
            </div>
          </div>
        )}

        {/* TAB 1: one photo */}
        {activeTab === 'single' && (
          <form onSubmit={handleSingleSubmit} className="p-2 space-y-3">
            <div>
              <div className="ofst-run mb-1">
                <span>Выделенные фото {selectedCards.length}/5</span>
                <span className="text-[var(--grey)]">{consideredNotes.length > 0 ? `+ ${consideredNotes.length} заметки` : ''}</span>
              </div>
              {!isProductReplacementMode && (
                <div className="flex mb-1">
                  {(['product', 'style'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setPhotoRole(r)}
                      className={`ofst-cell ${photoRole === r ? 'is-on' : ''}`}
                    >
                      {r === 'product' ? 'это продукт' : 'это пример стиля'}
                    </button>
                  ))}
                </div>
              )}
              {thumbs('w-16 h-16')}
              <p className="mt-1 text-[12px] text-[var(--grey)] leading-snug">
                {isProductReplacementMode
                  ? 'С них берутся сцена, свет и фон; продукт — из библиотеки.'
                  : photoRole === 'product'
                  ? 'Продукт остаётся как есть, сцену, свет и фон задаёт промпт или мастер-промпт.'
                  : 'С них берутся свет, фон, цвет и ракурс; что изобразить — пишешь в промпте.'}
              </p>
            </div>

            {/* Notes that go into the prompt */}
            {consideredNotes.length > 0 && (
              <div>
                <div className="ofst-run mb-1">
                  <span>Заметки в промпт</span>
                  <span>{consideredNotes.length}</span>
                </div>
                <div className="max-h-28 overflow-y-auto custom-scrollbar space-y-0.5">
                  {consideredNotes.map((note) => (
                    <div key={note.id} className="flex items-baseline gap-2 bg-[var(--soft)] px-2 py-1 text-[12px] leading-snug">
                      <span className="flex-1 min-w-0 break-words">{note.text || '(пустая заметка)'}</span>
                      <span className="shrink-0 text-[11px] text-[var(--grey)]">{note.isAttached ? 'прикреплена' : 'рядом'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Put my product into this scene */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer select-none text-[13px]">
                <input
                  type="checkbox"
                  id="toggle-product-replacement-mode"
                  checked={isProductReplacementMode}
                  onChange={(e) => setIsProductReplacementMode(e.target.checked)}
                  className="w-3.5 h-3.5 accent-black cursor-pointer"
                />
                <span>Поставить мой продукт в эту сцену</span>
                {isProductReplacementMode && onOpenProducts && (
                  <button type="button" onClick={onOpenProducts} className="ml-auto text-[12px] underline cursor-pointer">
                    продукты
                  </button>
                )}
              </label>
              {isProductReplacementMode &&
                (products.length === 0 ? (
                  <p className="mt-1 text-[12px] text-[var(--grey)]">
                    В библиотеке пока нет продуктов.{' '}
                    {onOpenProducts && (
                      <button type="button" onClick={onOpenProducts} className="underline text-[var(--fg)] cursor-pointer">
                        Добавить
                      </button>
                    )}
                  </p>
                ) : (
                  <div className="mt-1 flex items-center gap-0.5">
                    <select
                      id="gen-product-select"
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="flex-1 h-8 px-2 text-[13px]"
                    >
                      {products.map((prod) => (
                        <option key={prod.id} value={prod.id}>
                          {prod.name || 'Без названия'}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const currentProd = products.find((p) => p.id === selectedProductId);
                      return currentProd?.photoDataUrl ? (
                        <img src={currentProd.photoDataUrl} alt={currentProd.name} title={currentProd.name} className="w-8 h-8 object-cover bg-[var(--soft)] shrink-0" />
                      ) : null;
                    })()}
                  </div>
                ))}
            </div>

            {masterSelect('gen-master-prompt-select', 'Мастер-промпт')}
            {promptBox('gen-prompt-input', 'Сцена (промпт)', 'Сцена, окружение, свет…')}

            <div className="flex flex-wrap gap-0">
              {samplePrompts.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setPrompt(p);
                    if (textareaRef.current) textareaRef.current.style.height = 'auto';
                  }}
                  className="ofst-cell ofst-cell--muted !h-6 !px-1.5 !text-[12px]"
                  title={p}
                >
                  {p.slice(0, 22)}…
                </button>
              ))}
            </div>

            <div className="sticky bottom-0 bg-white pt-1 pb-2 flex items-center justify-between">
              <span className="hidden sm:inline text-[11px] text-[var(--grey)]">G — открыть / закрыть</span>
              <button type="submit" id="btn-trigger-generate" disabled={isGenerating} className="ofst-cell ofst-cell--primary !h-9 !px-4">
                {isGenerating ? 'Генерация…' : 'Сгенерировать'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: batch over products */}
        {activeTab === 'batch' && (
          <form onSubmit={handleBatchSubmit} className="p-2 space-y-3">
            <div>
              <div className="ofst-run mb-1">
                <span>
                  Продукты {selectedBatchProductIds.size} из {products.length}
                  {selectedBatchProductIds.size < 2 ? ' · нужно минимум 2' : ''}
                </span>
                <span className="flex gap-3">
                  <button type="button" onClick={handleSelectAllBatch} className="hover:text-[var(--fg)] cursor-pointer">
                    все
                  </button>
                  <button type="button" onClick={handleDeselectAllBatch} className="hover:text-[var(--fg)] cursor-pointer">
                    снять
                  </button>
                </span>
              </div>
              {products.length === 0 ? (
                <p className="text-[12px] text-[var(--grey)]">
                  В библиотеке нет продуктов.{' '}
                  {onOpenProducts && (
                    <button type="button" onClick={onOpenProducts} className="underline text-[var(--fg)] cursor-pointer">
                      Открыть продукты
                    </button>
                  )}
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-0.5">
                  {products.map((prod) => {
                    const isSelected = selectedBatchProductIds.has(prod.id);
                    const hasPhoto = Boolean(prod.photoDataUrl);
                    return (
                      <label
                        key={prod.id}
                        className={`flex items-center gap-2 pr-2 cursor-pointer select-none text-[13px] ${
                          isSelected ? 'bg-[var(--fg)] text-white' : 'bg-[var(--soft)] hover:bg-[var(--soft-2)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleBatchProduct(prod.id)}
                          className="sr-only"
                        />
                        <span className="w-9 h-9 shrink-0 bg-[var(--soft-2)]">
                          {hasPhoto && <img src={prod.photoDataUrl} alt={prod.name} className="w-full h-full object-cover" />}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{prod.name || 'Без названия'}</span>
                        {!hasPhoto && <span className="shrink-0 text-[11px] opacity-70">нет фото</span>}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="ofst-run mb-1">
                <span>Стиль с этих фото {selectedCards.length}/5</span>
                <span>один стиль для всех</span>
              </div>
              {thumbs('w-12 h-12')}
            </div>

            {masterSelect('gen-batch-master-prompt', 'Мастер-промпт (общий)')}
            {promptBox('gen-batch-prompt-input', 'Общий промпт', 'Окружение, свет, фон для всех выбранных продуктов…')}

            <div className="sticky bottom-0 bg-white pt-1 pb-2 flex items-center justify-between">
              <span className="hidden sm:inline text-[11px] text-[var(--grey)]">до 10 за раз</span>
              <button
                type="submit"
                id="btn-trigger-batch-generate"
                disabled={isGenerating || selectedBatchProductIds.size < 2 || products.length === 0}
                className="ofst-cell ofst-cell--primary !h-9 !px-4"
              >
                {isGenerating
                  ? batchProgress
                    ? `Генерация ${batchProgress.current} из ${batchProgress.total}…`
                    : 'Генерация…'
                  : `Сгенерировать пачку${selectedBatchProductIds.size > 0 ? ` (${selectedBatchProductIds.size})` : ''}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
