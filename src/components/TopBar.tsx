import React from 'react';
import { StorageInfo } from '../types';

/** Names of the top-bar tools, as shown in Меню → «Кнопки сверху» */
export type StudioView = 'board' | 'catalog' | 'video';
const VIEWS: { id: StudioView; label: string }[] = [
  { id: 'board', label: 'Доска' },
  { id: 'catalog', label: 'Каталог' },
  { id: 'video', label: 'Видео' },
];
/** Board-only tools are hidden on the other tabs */
const ALWAYS_TOOLS = new Set(['products', 'prompts']);

export const TOOL_LABELS: { id: string; label: string }[] = [
  { id: 'photo', label: 'Фото / папка' },
  { id: 'ai', label: 'AI' },
  { id: 'style', label: 'Стиль' },
  { id: 'products', label: 'Продукты' },
  { id: 'prompts', label: 'Промпты' },
  { id: 'group', label: 'Группа' },
  { id: 'links', label: 'Связи' },
  { id: 'mockup', label: 'Макет сайта' },
];

interface TopBarProps {
  projectName: string;
  cardCount: number;
  selectedCount: number;
  storageInfo: StorageInfo;
  onToggleSidebar?: () => void;
  onOpenRightDrawer?: () => void;
  onAddImage: () => void;
  onAddFolder?: () => void;
  onClearAll: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  onOpenExportModal: () => void;
  onOpenShortcuts: () => void;
  onGenerateSample: () => void;
  onOpenSettings: () => void;
  onToggleGeneration: () => void;
  isGenerationOpen: boolean;
  onOptimizeMemory: () => void;
  onClearMemory: () => void;
  isOptimizing?: boolean;
  onOpenMasterPrompts: () => void;
  isConnectionMode: boolean;
  onToggleConnectionMode: () => void;
  onAnalyzeStyle: () => void;
  isAnalyzingStyle?: boolean;
  onToggleProducts: () => void;
  isProductsOpen?: boolean;
  onGroupSelected?: () => void;
  canGroup?: boolean;
  onAddSiteMockup?: () => void;
  hasSiteMockup?: boolean;
  onExportImages?: () => void;
  onOpenCatalog?: () => void;
  /** Tool ids switched off in the menu */
  hiddenTools?: string[];
  isMenuOpen?: boolean;
  /** Projects column hidden on desktop: the «Проекты» cell then shows here to bring it back */
  isSidebarCollapsed?: boolean;
  /** The selection is exactly one group: the «Группа» cell then ungroups it */
  onUngroupSelected?: () => void;
  view?: StudioView;
  onChangeView?: (view: StudioView) => void;
  /** The logo folds every side panel and window (the projects column stays) */
  onLogoClick?: () => void;
  /** A catalog run going on in the background */
  catalogProgress?: { done: number; total: number } | null;
}

const APP_VERSION = 'v1.18 · 29.10';
const LANGS = [
  { id: 'ru', label: 'RU', name: 'Русский' },
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'cs', label: 'CS', name: 'Čeština' },
  { id: 'vi', label: 'VI', name: 'Tiếng Việt' },
];

/** A small popover that closes on any click outside it */
function usePopover() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  cardCount,
  selectedCount,
  storageInfo,
  onToggleSidebar,
  onOpenRightDrawer,
  hiddenTools = [],
  isMenuOpen = false,
  isSidebarCollapsed = false,
  onUngroupSelected,
  view = 'board',
  onChangeView,
  onLogoClick,
  catalogProgress,
  onAddImage,
  onAddFolder,
  onClearAll,
  onExportProject,
  onImportProject,
  onOpenExportModal,
  onOpenShortcuts,
  onGenerateSample,
  onOpenSettings,
  onToggleGeneration,
  isGenerationOpen,
  onOptimizeMemory,
  onClearMemory,
  isOptimizing = false,
  onOpenMasterPrompts,
  isConnectionMode,
  onToggleConnectionMode,
  onAnalyzeStyle,
  isAnalyzingStyle = false,
  onToggleProducts,
  isProductsOpen = false,
  onGroupSelected,
  canGroup = false,
  onAddSiteMockup,
  hasSiteMockup = false,
  onExportImages,
  onOpenCatalog,
}) => {

  // Toolbar buttons can be reordered by drag; the order is remembered in this browser
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [toolbarOrder, setToolbarOrder] = React.useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('aips_toolbar_order') || '[]');
    } catch {
      return [];
    }
  });
  // One entry for photos and folders: the browser can't offer both in one picker, so the cell opens a two-line choice.
  // Dropping files or folders on the board needs no choice at all.
  const [addMenuOpen, setAddMenuOpen] = React.useState(false);
  const addMenuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!addMenuOpen) return;
    const close = (e: PointerEvent) => {
      if (!addMenuRef.current?.contains(e.target as Node)) setAddMenuOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [addMenuOpen]);

  const cell = (on = false) => `ofst-cell ${on ? 'is-on' : ''}`;
  const copyMenu = usePopover();
  const langMenu = usePopover();
  const [lang, setLang] = React.useState<string>(() => {
    try {
      return localStorage.getItem('aips_lang') || 'ru';
    } catch {
      return 'ru';
    }
  });
  const pickLang = (id: string) => {
    setLang(id);
    try {
      localStorage.setItem('aips_lang', id);
    } catch {
      /* private mode */
    }
  };

  const toolbarItems: { id: string; desktopOnly: boolean; node: React.ReactNode }[] = [
    { id: 'photo', desktopOnly: false, node: (
      <div ref={addMenuRef} className="relative">
        <button
          id="btn-add-photos"
          onClick={() => (onAddFolder ? setAddMenuOpen((v) => !v) : onAddImage())}
          className="ofst-cell ofst-cell--primary"
          title="Добавить фото или папку (можно и просто перетащить на доску)"
        >
          Фото / папка
        </button>
        {addMenuOpen && onAddFolder && (
          <div className="absolute left-0 top-full z-50 flex flex-col bg-white min-w-full ofst-pop">
            <button id="btn-add-photos-files" className="ofst-cell justify-start" onClick={() => { setAddMenuOpen(false); onAddImage(); }}>
              Фото
            </button>
            <button id="btn-add-folder" className="ofst-cell justify-start" onClick={() => { setAddMenuOpen(false); onAddFolder(); }}>
              Папка
            </button>
          </div>
        )}
      </div>
    ) },
    { id: 'ai', desktopOnly: false, node: (
      <button id="btn-open-generation-panel" onClick={onToggleGeneration} className={cell(isGenerationOpen)} title="AI генерация (G)">
        AI
      </button>
    ) },
    { id: 'style', desktopOnly: true, node: (
      <button
        id="btn-analyze-style"
        onClick={onAnalyzeStyle}
        disabled={isAnalyzingStyle}
        className={cell()}
        title="Описать стиль выделенных фото: Gemini вернёт теги (свет, фон, цвет, ракурс), их можно сохранить как мастер-промпт"
      >
        {isAnalyzingStyle ? 'Стиль…' : 'Стиль'}
      </button>
    ) },
    { id: 'products', desktopOnly: true, node: (
      <button id="btn-toggle-products-library" onClick={onToggleProducts} className={cell(isProductsOpen)} title="Позиции проекта">
        Продукты
      </button>
    ) },
    { id: 'prompts', desktopOnly: true, node: (
      <button id="btn-topbar-master-prompts" onClick={onOpenMasterPrompts} className={cell()} title="Мастер-промпты">
        Промпты
      </button>
    ) },
    { id: 'group', desktopOnly: true, node: canGroup && onGroupSelected && (
      <button
        id="btn-group-selected-cards"
        onClick={onUngroupSelected || onGroupSelected}
        className={cell(Boolean(onUngroupSelected))}
        title={onUngroupSelected ? 'Разгруппировать (⇧⌘G)' : 'Сгруппировать выделенные (⌘G)'}
      >
        {onUngroupSelected ? 'Разгруппировать' : 'Группа'}
      </button>
    ) },
    { id: 'links', desktopOnly: true, node: (
      <button id="btn-toggle-connection-mode" onClick={onToggleConnectionMode} className={cell(isConnectionMode)} title="Режим связей (L)">
        Связи
      </button>
    ) },
    { id: 'mockup', desktopOnly: true, node: onAddSiteMockup && (
      <button
        id="btn-topbar-site-mockup"
        onClick={onAddSiteMockup}
        className={cell(hasSiteMockup)}
        title="Положить под доску скриншот сайта клиента и смотреть, как фото встанут на страницу"
      >
        Макет сайта
      </button>
    ) },
  ];

  const visibleToolbar = toolbarItems.filter(
    (i) =>
      !hiddenTools.includes(i.id) &&
      (view === 'board' || ALWAYS_TOOLS.has(i.id)) &&
      (i.id !== 'group' || (canGroup && onGroupSelected))
  );
  const orderedToolbar = [...visibleToolbar].sort((a, b) => {
    const ia = toolbarOrder.indexOf(a.id);
    const ib = toolbarOrder.indexOf(b.id);
    return (ia < 0 ? 100 + toolbarItems.indexOf(a) : ia) - (ib < 0 ? 100 + toolbarItems.indexOf(b) : ib);
  });
  // Live reorder while dragging: neighbours slide aside (FLIP animation); saved when the drag ends
  const itemRefs = React.useRef(new Map<string, HTMLDivElement>());
  const lastRects = React.useRef(new Map<string, DOMRect>());
  const moveToolbarItem = (fromId: string, toId: string) => {
    const ids = orderedToolbar.map((i) => i.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0 || from === to) return;
    itemRefs.current.forEach((el, id) => lastRects.current.set(id, el.getBoundingClientRect()));
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setToolbarOrder(ids);
  };
  const persistToolbarOrder = () => {
    try {
      localStorage.setItem('aips_toolbar_order', JSON.stringify(orderedToolbar.map((i) => i.id)));
    } catch {
      /* private mode */
    }
  };
  React.useLayoutEffect(() => {
    if (lastRects.current.size === 0) return;
    itemRefs.current.forEach((el, id) => {
      const before = lastRects.current.get(id);
      if (!before) return;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      if (!dx) return;
      el.style.transition = 'none';
      el.style.transform = `translateX(${dx}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms ease';
        el.style.transform = '';
      });
    });
    lastRects.current.clear();
  }, [toolbarOrder]);

  return (
    <header id="app-topbar" className="h-10 bg-white px-2 flex items-center justify-between gap-2 select-none z-30 shrink-0">
      {/* Studio name, project, count */}
      <div className="flex items-center self-stretch gap-3 min-w-0 overflow-hidden text-[13px]">
        {onToggleSidebar && (
          <button id="btn-toggle-sidebar" onClick={onToggleSidebar} className={`ofst-cell -ml-2 ${isSidebarCollapsed ? '' : 'md:hidden'}`} title="Показать проекты" aria-label="Проекты">
            Проекты
          </button>
        )}
        <button
          onClick={onLogoClick}
          className="hidden sm:flex flex-col items-start justify-center shrink-0 h-full -ml-2 px-2 text-left hover:bg-[var(--soft)] cursor-pointer"
          title="Свернуть все панели и окна (проекты останутся)"
        >
          <span className="font-semibold tracking-[.02em] leading-4">OFST Photo</span>
          <span className="text-[10px] leading-3 text-[var(--grey)] tabular-nums">{APP_VERSION}</span>
        </button>
        {/* Tabs: the board, the catalog conveyor, video (to come) */}
        {onChangeView && (
          <nav className="flex shrink-0 self-stretch" aria-label="Режим" role="tablist">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => onChangeView(v.id)}
                role="tab"
                aria-selected={view === v.id}
                className={`ofst-tab ${view === v.id ? 'is-on' : ''}`}
                aria-current={view === v.id ? 'page' : undefined}
              >
                {v.label}
                {v.id === 'catalog' && catalogProgress && (
                  <span className="ml-1 text-[11px] tabular-nums opacity-70" title="Каталог прогоняется">
                    {catalogProgress.done}/{catalogProgress.total}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}
        <span className="hidden lg:inline truncate text-[var(--grey)]">
          {projectName} · {cardCount} фото
          {selectedCount > 0 && <span className="ml-1 text-[var(--fg)]">· выбрано {selectedCount}</span>}
        </span>
      </div>

      {/* Tools: text cells, reorderable by drag */}
      <div className="flex items-center shrink-0">
        {orderedToolbar.map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={(e) => {
              setDragId(item.id);
              setAddMenuOpen(false);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('application/x-aips-toolbar', item.id);
            }}
            ref={(el) => {
              if (el) itemRefs.current.set(item.id, el);
              else itemRefs.current.delete(item.id);
            }}
            onDragEnter={() => {
              if (dragId && dragId !== item.id) moveToolbarItem(dragId, item.id);
            }}
            onDragOver={(e) => {
              if (dragId) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              persistToolbarOrder();
              setDragId(null);
            }}
            onDragEnd={() => {
              persistToolbarOrder();
              setDragId(null);
            }}
            className={`${item.desktopOnly ? 'hidden lg:flex' : 'flex'} ${dragId === item.id ? 'opacity-30' : ''} ${dragId ? 'cursor-grabbing' : ''}`}
            title="Перетащи, чтобы поменять порядок кнопок"
          >
            {item.node}
          </div>
        ))}

        <span className="hidden lg:block w-3" />
        <div className="hidden lg:flex items-center">
          <button id="btn-topbar-settings" onClick={onOpenSettings} className="ofst-cell ofst-cell--muted" title="Настройки Gemini API">
            Настройки
          </button>
          {/* Copy of the project: asks first, says what the file is */}
          <div ref={copyMenu.ref} className="relative">
            <button
              id="btn-top-project-copy"
              onClick={() => copyMenu.setOpen((v) => !v)}
              className={`ofst-cell ${copyMenu.open ? 'is-on' : 'ofst-cell--muted'}`}
              title="Скачать копию проекта или открыть копию из файла"
            >
              Копия
            </button>
            {copyMenu.open && (
              <div className="ofst-window absolute right-0 top-full mt-1 z-50 w-[300px] bg-white p-2 text-[13px] ofst-pop">
                <div className="ofst-run">
                  <span>Копия проекта «{projectName}»</span>
                </div>
                <p className="text-[12px] text-[var(--grey)] leading-snug pt-1">
                  Один файл .json: фото доски, заметки, группы, оси, позиции и мастер-промпты. Нужна, чтобы перенести проект в другой
                  браузер или сохранить на всякий случай. Каталог (прогоны) в неё не входит.
                </p>
                <div className="flex flex-col pt-1">
                  <button
                    id="btn-top-export-json"
                    className="ofst-cell ofst-cell--primary justify-between"
                    onClick={() => {
                      copyMenu.setOpen(false);
                      onExportProject();
                    }}
                  >
                    <span>Скачать копию</span>
                    <span className="opacity-60">.json</span>
                  </button>
                  <button
                    id="btn-top-import-json"
                    className="ofst-cell justify-between"
                    onClick={() => {
                      copyMenu.setOpen(false);
                      onImportProject();
                    }}
                  >
                    <span>Открыть копию из файла</span>
                    <span className="text-[var(--grey)]">новым проектом</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Language of the studio: the choice is kept; translations come later */}
        <div ref={langMenu.ref} className="relative">
          <button
            onClick={() => langMenu.setOpen((v) => !v)}
            className={`ofst-cell ${langMenu.open ? 'is-on' : 'ofst-cell--muted'}`}
            title="Язык студии"
            aria-label="Язык студии"
          >
            {LANGS.find((l) => l.id === lang)?.label || 'RU'}
          </button>
          {langMenu.open && (
            <div className="ofst-window absolute right-0 top-full mt-1 z-50 w-[200px] bg-white p-2 text-[13px] ofst-pop">
              <div className="ofst-run">
                <span>Язык</span>
              </div>
              <div className="flex flex-col pt-1">
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    className={`ofst-cell justify-between ${lang === l.id ? 'is-on' : ''}`}
                    onClick={() => {
                      pickLang(l.id);
                      langMenu.setOpen(false);
                    }}
                  >
                    <span>{l.name}</span>
                    <span className="opacity-60">{l.label}</span>
                  </button>
                ))}
              </div>
              {lang !== 'ru' && <p className="text-[11px] text-[var(--grey)] leading-snug pt-1">Перевод готовится: пока весь текст по-русски.</p>}
            </div>
          )}
        </div>
        {onOpenRightDrawer && (
          <button id="btn-open-right-actions-drawer" onClick={onOpenRightDrawer} className={`ofst-cell ${isMenuOpen ? 'is-on' : 'ofst-cell--muted'}`} title="Все инструменты и настройки" aria-label="Меню инструментов">
            Меню
          </button>
        )}
      </div>
    </header>
  );
};
