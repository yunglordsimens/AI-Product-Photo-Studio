import { PromptExampleView } from './PromptExampleView';
import { Info } from './Info';
import React, { useState, useRef, useEffect } from 'react';
import { Card, MasterPrompt, Note, ProductItem } from '../types';
import { groupPrompts } from '../utils/promptCategories';
import { REFERENCE_ROLES, splitSelection } from '../utils/referenceRoles';

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
}

interface GenerationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCards: Card[];
  consideredNotes: ConsideredNoteInfo[];
  onDeselectCard?: (cardId: string) => void;
  onGenerate: (prompt: string, options?: GenerationOptions) => Promise<void>;
  /** Generations queued or running right now */
  activeGenerations: number;
  errorMessage: string | null;
  onClearError: () => void;
  onOpenSettings: () => void;
  masterPrompts?: MasterPrompt[];
  /** Active project: its own prompts are listed, other projects' are hidden */
  projectId?: string;
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
  activeGenerations,
  errorMessage,
  onClearError,
  onOpenSettings,
  masterPrompts = [],
  projectId,
  onOpenMasterPrompts,
  currentPromptPreset,
  products = [],
  onOpenProducts,
}: GenerationPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedMasterPromptId, setSelectedMasterPromptId] = useState('');
  const [isProductReplacementMode, setIsProductReplacementMode] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
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
      // «Применить» in the library: remember which prompt it was, so its name and example follow the result
      const mp = masterPrompts.find((p) => p.prompt === currentPromptPreset);
      setSelectedMasterPromptId(mp ? mp.id : '');
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

  if (!isOpen) return null;

  // Single Generation Submit
  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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
      });
    }
  };

  const samplePrompts = [
    'На деревянном подиуме с мягким студийным светом',
    'Премиальный мраморный фон с отражением',
    'Ботанические листья и капли утренней росы',
    'Чистый минималистичный белый фон с мягкими тенями',
  ];

  // What the click will make: one shot per product, references go to every shot
  const { products: selProducts, refs: selRefs } = splitSelection(selectedCards);
  const refIds = new Set(selRefs.map((c) => c.id));
  const shots = isProductReplacementMode ? 1 : selProducts.length || 1;
  const plural = (n: number, one: string, few: string, many: string) =>
    n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

  const thumbs = (size: string) =>
    selectedCards.length === 0 ? (
      <p className="text-[12px] text-[var(--grey)] py-1">Выдели на доске фото (Shift+клик или рамкой)</p>
    ) : (
      <div className="flex gap-0.5 overflow-x-auto custom-scrollbar">
        {selectedCards.slice(0, 8).map((card, idx) => (
          <div key={card.id} className={`relative group shrink-0 ${size} bg-[var(--soft)]`}>
            <img src={card.src} alt={card.name || `Фото ${idx + 1}`} className="w-full h-full object-cover" />
            {!isProductReplacementMode && refIds.has(card.id) && (
              <span className="absolute left-0 bottom-0 bg-white px-1 text-[10px] leading-4" title="Референс: с него берётся то, что отмечено в «берём:»">
                реф
              </span>
            )}
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
        {selectedCards.length > 8 && (
          <div className={`shrink-0 ${size} bg-[var(--soft)] flex items-center justify-center text-[12px]`}>
            +{selectedCards.length - 8}
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
      {(() => {
        const mp = masterPrompts.find((p) => p.id === selectedMasterPromptId);
        if (!mp) return null;
        return (
          <div className="flex items-center gap-2 pt-1 text-[11px] text-[var(--grey)]">
            <PromptExampleView example={mp.example} />
            <span className="leading-snug">
              {mp.example ? 'пример: до | после' : 'примера пока нет — первый результат с этим промптом станет примером'}
            </span>
          </div>
        );
      })()}
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
      {/* A column in the studio dock (right side) */}
      <div
        ref={panelRef}
        id="generation-floating-panel"
        className="ofst-panel h-full text-[var(--fg)] overflow-y-auto custom-scrollbar"
      >
        <div className="sticky top-0 z-10 bg-white px-2 pt-2 select-none">
          <div className="ofst-run">
            <span>AI генерация</span>
            <span className="flex gap-3">
              <button type="button" onClick={onOpenSettings} className="hover:text-[var(--fg)] cursor-pointer" title="Настройки API">
                настройки
              </button>
              <button type="button" onClick={onClose} className="ofst-x" title="Закрыть панель (G)" aria-label="Закрыть">
                ×
              </button>
            </span>
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

        <form onSubmit={handleSingleSubmit} className="p-2 space-y-3">
            <div>
              <div className="ofst-run mb-1">
                <span className="flex items-center gap-1">
                  Выделенные фото {selectedCards.length}
                  <Info>
                    Каждое выделенное фото — товар, из него получается свой кадр. Фото с ролью «берём:» (фон, свет, ракурс…) —
                    референс: сам не генерируется, а идёт примером в каждый кадр. Роль ставится на фото на доске. Можно выделить
                    другие фото и нажать ещё раз, не дожидаясь: всё делается параллельно.
                  </Info>
                </span>
                <span className="text-[var(--grey)]">{consideredNotes.length > 0 ? `+ ${consideredNotes.length} заметки` : ''}</span>
              </div>
              {thumbs('w-16 h-16')}
              {selectedCards.some((c) => c.takes?.length) && (
                <p className="mt-1 text-[12px] leading-snug">
                  {selectedCards
                    .slice(0, 8)
                    .map((c, i) =>
                      c.takes?.length
                        ? `${i + 1}: ${c.takes.map((t) => REFERENCE_ROLES.find((r) => r.id === t)?.label).filter(Boolean).join(', ')}`
                        : ''
                    )
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              <p className="mt-1 text-[12px] text-[var(--grey)] leading-snug">
                {isProductReplacementMode
                  ? 'С выделенных фото берутся сцена, свет и фон; продукт — из библиотеки. Получится один кадр.'
                  : selProducts.length > 0
                    ? `${selProducts.length === 1 ? 'Товар остаётся' : `${selProducts.length} ${plural(selProducts.length, 'товар', 'товара', 'товаров')}, у каждого свой кадр. Товары остаются`} как есть; сцену задают промпт${selRefs.length ? ` и ${selRefs.length === 1 ? 'референс' : `${selRefs.length} ${plural(selRefs.length, 'референс', 'референса', 'референсов')}`}` : ''}.`
                    : selRefs.length > 0
                      ? 'Выделены только референсы: получится один кадр в их стиле, что изобразить — пишешь в промпте.'
                      : 'Без фото кадр делается только по промпту.'}
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
              <span className="text-[12px] text-[var(--grey)] tabular-nums">
                {activeGenerations > 0 ? `идёт: ${activeGenerations}` : ''}
              </span>
              <button type="submit" id="btn-trigger-generate" className="ofst-cell ofst-cell--primary !h-9 !px-4">
                {shots > 1 ? `Сгенерировать ${shots}` : 'Сгенерировать'}
              </button>
            </div>
          </form>

      </div>
    </>
  );
}
