import React, { useRef, useState } from 'react';
import { Card, MasterPrompt } from '../types';
import { PromptExampleView } from './PromptExampleView';
import { Info } from './Info';
import { makeExample, withExample } from '../utils/promptExamples';
import { isImageFile, normalizeImageFiles } from '../utils/heic';
import { FloatingWindow } from './FloatingWindow';
import { PROMPT_CATEGORIES, groupPrompts, promptCategory } from '../utils/promptCategories';

interface MasterPromptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterPrompts: MasterPrompt[];
  onSaveMasterPrompts: (prompts: MasterPrompt[]) => void;
  onSelectPromptForGen?: (promptText: string) => void;
  projectId?: string;
  projectName?: string;
  /** Photos selected on the board: they can become the prompt's example */
  selectedCards?: Card[];
  /** Run the prompt on the selected photo; the result becomes its example */
  onTryPrompt?: (prompt: MasterPrompt) => void;
  isGenerating?: boolean;
}

const readAsDataUrl = (f: File) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => resolve('');
    r.readAsDataURL(f);
  });

export const MasterPromptsModal: React.FC<MasterPromptsModalProps> = ({
  isOpen,
  onClose,
  masterPrompts,
  onSaveMasterPrompts,
  onSelectPromptForGen,
  projectId,
  projectName,
  selectedCards = [],
  onTryPrompt,
  isGenerating = false,
}) => {
  const [view, setView] = useState<'list' | 'gallery'>(() => {
    try {
      return localStorage.getItem('aips_prompts_view') === 'gallery' ? 'gallery' : 'list';
    } catch {
      return 'list';
    }
  });
  const [exampleFor, setExampleFor] = useState<string | null>(null);
  const [exampleNote, setExampleNote] = useState<string | null>(null);
  const exampleFileRef = useRef<HTMLInputElement>(null);
  const exampleTarget = useRef<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPrompt, setEditingPrompt] = useState<MasterPrompt | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formText, setFormText] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formCategory, setFormCategory] = useState('Мои');
  const [formProjectOnly, setFormProjectOnly] = useState(false);
  const [shelf, setShelf] = useState<string>('Все');
  const [formError, setFormError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const changeView = (v: 'list' | 'gallery') => {
    setView(v);
    try {
      localStorage.setItem('aips_prompts_view', v);
    } catch {
      /* private mode */
    }
  };

  const setExample = async (id: string, before: string | undefined, after: string) => {
    const ex = await makeExample(before, after, 'manual');
    onSaveMasterPrompts(withExample(masterPrompts, id, ex));
    setExampleFor(null);
    setExampleNote(null);
  };

  const exampleFromSelection = (id: string) => {
    if (selectedCards.length === 0 || selectedCards.length > 2) {
      setExampleNote('Выдели на доске 1 фото (только «после») или 2: сначала «до», потом «после».');
      return;
    }
    if (selectedCards.length === 1) setExample(id, undefined, selectedCards[0].src);
    else setExample(id, selectedCards[0].src, selectedCards[1].src);
  };

  const onExampleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const id = exampleTarget.current;
    const files = (await normalizeImageFiles(Array.from(e.target.files || []).filter(isImageFile))).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );
    e.target.value = '';
    if (!id || files.length === 0) return;
    const urls = await Promise.all(files.slice(0, 2).map(readAsDataUrl));
    if (urls.length === 1) setExample(id, undefined, urls[0]);
    else setExample(id, urls[0], urls[1]);
  };

  /** Actions to give a prompt its example */
  const exampleActions = (item: MasterPrompt) =>
    exampleFor === item.id && (
      <div className="col-span-full bg-white p-1 text-[12px] ofst-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap">
          <button
            onClick={() => exampleFromSelection(item.id)}
            className="ofst-cell !h-6 !text-[12px]"
            title="1 фото — только «после»; 2 фото — сначала «до», потом «после»"
          >
            из выделенных на доске{selectedCards.length ? ` (${selectedCards.length})` : ''}
          </button>
          {onTryPrompt && (
            <button
              onClick={() => {
                if (selectedCards.length === 0) {
                  setExampleNote('Выдели на доске фото, на котором попробовать этот промпт.');
                  return;
                }
                onTryPrompt(item);
                setExampleFor(null);
                setExampleNote(null);
              }}
              disabled={isGenerating}
              className="ofst-cell !h-6 !text-[12px]"
              title="Сгенерировать с этим промптом из выделенного фото; результат ляжет на доску и станет примером"
            >
              попробовать на выделенном
            </button>
          )}
          <button
            onClick={() => {
              exampleTarget.current = item.id;
              exampleFileRef.current?.click();
            }}
            className="ofst-cell !h-6 !text-[12px]"
            title="1 файл — «после»; 2 файла — «до» и «после» (по алфавиту)"
          >
            с компьютера
          </button>
          {item.example && (
            <button onClick={() => onSaveMasterPrompts(withExample(masterPrompts, item.id, undefined))} className="ofst-cell ofst-cell--muted !h-6 !text-[12px]">
              убрать пример
            </button>
          )}
          <button onClick={() => setExampleFor(null)} className="ofst-cell ofst-cell--muted !h-6 !text-[12px]">
            отмена
          </button>
        </div>
        {exampleNote && <p className="px-2 pt-0.5 text-[var(--grey)]">{exampleNote}</p>}
      </div>
    );

  const exampleButton = (item: MasterPrompt) => (
    <button
      onClick={() => {
        setExampleFor(exampleFor === item.id ? null : item.id);
        setExampleNote(null);
      }}
      className={`ofst-cell !h-6 !text-[12px] ${exampleFor === item.id ? 'is-on' : 'ofst-cell--muted'}`}
      title="Задать картинку-пример: до и после"
    >
      пример
    </button>
  );

  const applyButton = (item: MasterPrompt) =>
    onSelectPromptForGen && (
      <button
        onClick={() => {
          onSelectPromptForGen(item.prompt);
          onClose();
        }}
        className="ofst-cell ofst-cell--primary !h-6 !text-[12px]"
        title="Вставить в форму генерации"
      >
        Применить
      </button>
    );

  const handleStartCreate = () => {
    setEditingPrompt(null);
    setFormName('');
    setFormText('');
    setFormTags('');
    setFormCategory(shelf !== 'Все' && shelf !== 'Этот проект' ? shelf : 'Мои');
    setFormProjectOnly(shelf === 'Этот проект');
    setFormError('');
    setIsCreatingNew(true);
  };

  const handleStartEdit = (p: MasterPrompt) => {
    setEditingPrompt(p);
    setFormName(p.name);
    setFormText(p.prompt);
    setFormTags((p.tags || []).join(', '));
    setFormCategory(promptCategory(p));
    setFormProjectOnly(Boolean(p.projectId));
    setFormError('');
    setIsCreatingNew(false);
  };

  const handleCancelForm = () => {
    setEditingPrompt(null);
    setIsCreatingNew(false);
    setFormError('');
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Укажите название мастер-промпта');
      return;
    }
    if (!formText.trim()) {
      setFormError('Укажите текст промпта');
      return;
    }

    const parsedTags = formTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingPrompt) {
      const updated = masterPrompts.map((p) =>
        p.id === editingPrompt.id
          ? {
              ...p,
              name: formName.trim(),
              prompt: formText.trim(),
              tags: parsedTags,
              category: formCategory.trim() || 'Мои',
              projectId: formProjectOnly ? p.projectId || projectId : undefined,
            }
          : p
      );
      onSaveMasterPrompts(updated);
    } else {
      const newPrompt: MasterPrompt = {
        id: 'mp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: formName.trim(),
        prompt: formText.trim(),
        tags: parsedTags,
        category: formCategory.trim() || 'Мои',
        projectId: formProjectOnly ? projectId : undefined,
        createdAt: Date.now(),
      };
      onSaveMasterPrompts([newPrompt, ...masterPrompts]);
    }

    handleCancelForm();
  };

  const handleDelete = (prompt: MasterPrompt) => {
    if (window.confirm(`Удалить мастер-промпт "${prompt.name}"?`)) {
      const filtered = masterPrompts.filter((p) => p.id !== prompt.id);
      onSaveMasterPrompts(filtered);
      if (editingPrompt?.id === prompt.id) {
        handleCancelForm();
      }
    }
  };

  const handleCopyText = (prompt: MasterPrompt) => {
    navigator.clipboard.writeText(prompt.prompt);
    setCopiedId(prompt.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const q = searchQuery.toLowerCase().trim();
  const matches = (p: MasterPrompt) =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    p.prompt.toLowerCase().includes(q) ||
    (p.tags || []).some((t) => t.toLowerCase().includes(q));
  const shelves = groupPrompts(masterPrompts, projectId);
  const shownShelves = shelves
    .filter((g) => shelf === 'Все' || g.title === shelf)
    .map((g) => ({ ...g, items: g.items.filter(matches) }))
    .filter((g) => g.items.length > 0);
  const filteredPrompts = shownShelves.flatMap((g) => g.items);

  return (
    <FloatingWindow id="prompts" title="Мастер-промпты" meta={masterPrompts.length} width={768} onClose={onClose} className="flex flex-col max-h-[88vh] gap-2">

        {/* Search + new */}
        {!isCreatingNew && !editingPrompt && (
          <div className="flex items-stretch gap-0.5 shrink-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию, тексту или тегам"
              className="flex-1 h-8 px-2 text-[13px]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="ofst-cell ofst-cell--muted !h-8">
                сбросить
              </button>
            )}
            <button onClick={handleStartCreate} className="ofst-cell ofst-cell--primary !h-8">
              + Новый
            </button>
          </div>
        )}

        {/* Shelves */}
        {!isCreatingNew && !editingPrompt && (
          <div className="flex flex-wrap items-center shrink-0 -mx-0.5">
            {['Все', ...shelves.map((g) => g.title)].map((t) => (
              <button key={t} onClick={() => setShelf(t)} className={`ofst-cell !h-7 ${shelf === t ? 'is-on' : 'ofst-cell--muted'}`}>
                {t}
                <span className="opacity-60 tabular-nums">
                  {t === 'Все' ? shelves.reduce((n, g) => n + g.items.length, 0) : shelves.find((g) => g.title === t)?.items.length}
                </span>
              </button>
            ))}
            <span className="flex-1" />
            <span className="flex items-center gap-1 pr-0.5">
              <Info>
                У каждого промпта может быть пример «до | после». Он появляется сам после первой генерации с этим промптом, или его можно задать:
                «пример» → из выделенных на доске, «попробовать на выделенном» или с компьютера. В режиме «примеры» наведи на картинку, чтобы
                увидеть «до».
              </Info>
              <button onClick={() => changeView('list')} className={`ofst-cell !h-7 ${view === 'list' ? 'is-on' : 'ofst-cell--muted'}`}>
                список
              </button>
              <button onClick={() => changeView('gallery')} className={`ofst-cell !h-7 ${view === 'gallery' ? 'is-on' : 'ofst-cell--muted'}`}>
                примеры
              </button>
            </span>
          </div>
        )}

        {/* Create / edit */}
        {(isCreatingNew || editingPrompt) && (
          <form onSubmit={handleSaveForm} className="space-y-2 shrink-0">
            <div className="ofst-run">
              <span>{editingPrompt ? 'Изменить мастер-промпт' : 'Новый мастер-промпт'}</span>
            </div>
            {formError && <p className="bg-[var(--marker)] px-1 text-[13px]">{formError}</p>}
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Название, например: Каталог, тёмный фон"
              className="w-full h-8 px-2 text-[13px]"
              autoFocus
            />
            <textarea
              rows={5}
              value={formText}
              onChange={(e) => setFormText(e.target.value)}
              placeholder="Фон, окружение, свет, детали…"
              className="w-full p-2 text-[13px] resize-y leading-snug"
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <label className="flex items-center gap-1 text-[12px] text-[var(--grey)]">
                Полка
                <input
                  list="mp-shelves"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="h-7 px-2 text-[13px] text-[var(--fg)] w-40"
                />
                <datalist id="mp-shelves">
                  {PROMPT_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              {projectId && (
                <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formProjectOnly}
                    onChange={(e) => setFormProjectOnly(e.target.checked)}
                    className="accent-black w-3.5 h-3.5"
                  />
                  только для проекта «{projectName}»
                </label>
              )}
            </div>
            <input
              type="text"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
              placeholder="Теги через запятую (необязательно)"
              className="w-full h-8 px-2 text-[13px]"
            />
            <div className="flex justify-end">
              <button type="button" onClick={handleCancelForm} className="ofst-cell ofst-cell--muted">
                Отмена
              </button>
              <button type="submit" className="ofst-cell ofst-cell--primary">
                Сохранить
              </button>
            </div>
          </form>
        )}

        {/* Index of prompts */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {filteredPrompts.length === 0 ? (
            <p className="py-6 text-[13px] text-[var(--grey)]">
              {searchQuery ? 'Ничего не найдено.' : 'Пока пусто. «+ Новый» сохранит шаблон.'}
            </p>
          ) : (
            <div className="space-y-3">
              {shownShelves.map((g) => (
                <section key={g.title}>
                  {shelf === 'Все' && (
                    <div className="ofst-run mb-0.5">
                      <span>{g.title}</span>
                      <span>{g.items.length}</span>
                    </div>
                  )}
                  {view === 'gallery' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-1 gap-y-3">
                      {g.items.map((item) => (
                        <div key={item.id} className="min-w-0 flex flex-col">
                          <PromptExampleView example={item.example} size="large" />
                          <h4 className="text-[13px] font-medium leading-tight pt-1">{item.name}</h4>
                          <p className="text-[11px] text-[var(--grey)] leading-snug line-clamp-2 select-text">{item.prompt}</p>
                          <div className="flex flex-wrap pt-0.5 -ml-2">
                            {applyButton(item)}
                            {exampleButton(item)}
                          </div>
                          {exampleActions(item)}
                        </div>
                      ))}
                    </div>
                  ) : (
                  <ol>
                    {g.items.map((item, idx) => (
                    <li key={item.id} className="group grid grid-cols-[28px_84px_minmax(0,1fr)_auto] gap-x-2 py-1.5 hover:bg-[var(--soft)]">
                      <span className="text-[12px] tabular-nums text-[var(--grey)] pl-1 pt-px">{String(idx + 1).padStart(2, '0')}</span>
                      <PromptExampleView example={item.example} />
                      <div className="min-w-0">
                        <h4 className="text-[13px] font-medium leading-tight">{item.name}</h4>
                        <p className="text-[12px] text-[var(--grey)] leading-snug line-clamp-2 select-text">{item.prompt}</p>
                        {item.tags && item.tags.length > 0 && (
                          <p className="text-[11px] text-[var(--grey)] pt-0.5">{item.tags.join(' · ')}</p>
                        )}
                      </div>
                      <div className="flex items-start text-[12px]">
                        {applyButton(item)}
                        {exampleButton(item)}
                        <button onClick={() => handleCopyText(item)} className="ofst-cell ofst-cell--muted !h-6 !text-[12px]" title="Скопировать текст">
                          {copiedId === item.id ? 'скопировано' : 'копия'}
                        </button>
                        <button onClick={() => handleStartEdit(item)} className="ofst-cell ofst-cell--muted !h-6 !text-[12px]" title="Редактировать">
                          изменить
                        </button>
                        <button onClick={() => handleDelete(item)} className="ofst-cell ofst-cell--muted !h-6 !text-[12px] hover:!bg-[var(--marker)]" title="Удалить">
                          удалить
                        </button>
                      </div>
                      {exampleActions(item)}
                    </li>
                  ))}
                  </ol>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
        <input ref={exampleFileRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={onExampleFiles} />
    </FloatingWindow>
  );
};
