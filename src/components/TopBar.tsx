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
      <div className="flex items-baseline gap-3 min-w-0 overflow-hidden text-[13px]">
        {onToggleSidebar && (
          <button id="btn-toggle-sidebar" onClick={onToggleSidebar} className={`ofst-cell -ml-2 ${isSidebarCollapsed ? '' : 'md:hidden'}`} title="Показать проекты" aria-label="Проекты">
            Проекты
          </button>
        )}
        <span className="hidden sm:inline font-semibold tracking-[.02em] shrink-0">OFST Photo</span>
        {/* Tabs: the board, the catalog conveyor, video (to come) */}
        {onChangeView && (
          <nav className="flex shrink-0 self-center" aria-label="Режим">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => onChangeView(v.id)}
                className={`ofst-cell ${view === v.id ? 'is-on' : 'ofst-cell--muted'}`}
                aria-current={view === v.id ? 'page' : undefined}
              >
                {v.label}
              </button>
            ))}
          </nav>
        )}
        <span className="hidden lg:inline truncate text-[var(--grey)]">
          {projectName} · {cardCount} фото
          {selectedCount > 0 && <span className="ml-1 text-[var(--fg)]">· выбрано {selectedCount}</span>}
        </span>
        <span className="hidden xl:inline text-[11px] text-[var(--grey)] shrink-0">v1.12 · 21.10</span>
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
          <button id="btn-top-export-json" onClick={onExportProject} className="ofst-cell ofst-cell--muted" title="Скачать проект файлом JSON">
            Скачать
          </button>
          <button id="btn-top-import-json" onClick={onImportProject} className="ofst-cell ofst-cell--muted" title="Открыть проект из файла JSON">
            Открыть
          </button>
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
