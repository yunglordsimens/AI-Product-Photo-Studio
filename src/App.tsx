import { useCallback, useState } from 'react';
import { Card, MasterPrompt, PackagingBrief, ProductItem, Project, StorageInfo } from './types';
import { FolderFile, groupByFolder } from './utils/folderImport';
import { isGenericName } from './utils/positionsImport';
import { TopBar, TOOL_LABELS, StudioView } from './components/TopBar';
import { VideoTab } from './components/VideoTab';
import { useUndo } from './hooks/useUndo';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ExportModal } from './components/ExportModal';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { SettingsModal } from './components/SettingsModal';
import { CloudBanner, CloudConflictsWindow } from './components/CloudUI';
import { GenerationPanel } from './components/GenerationPanel';
import { MasterPromptsModal } from './components/MasterPromptsModal';
import { StyleAnalysisModal } from './components/StyleAnalysisModal';
import { ProductLibraryDrawer } from './components/ProductLibraryDrawer';
import { ImageCropModal } from './components/ImageCropModal';
import { RightDrawer } from './components/RightDrawer';
import { DockSlot } from './components/DockSlot';
import { CatalogStudio } from './components/CatalogStudio';
import { PackagingStudio } from './components/PackagingStudio';
import { Info } from './components/Info';
import { useStudioLayout } from './hooks/useStudioLayout';
import { useProjectData } from './hooks/useProjectData';
import { useImageImport } from './hooks/useImageImport';
import { useBoardEditing } from './hooks/useBoardEditing';
import { useGeneration } from './hooks/useGeneration';
import { useProjectFiles } from './hooks/useProjectFiles';
import { usePositionsAndAxes } from './hooks/usePositionsAndAxes';
import { useBoardShortcuts } from './hooks/useBoardShortcuts';
import { CanvasCropQueueItem, DockId, STUDIO_HOME_HOST, isDeploymentCopy } from './studio/shared';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string>('');
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({
    usedBytes: 0,
    maxBytes: 5 * 1024 * 1024,
    percentage: 0,
  });
  // Master Prompts state
  const [masterPrompts, setMasterPrompts] = useState<MasterPrompt[]>([]);
  const [isMasterPromptsOpen, setIsMasterPromptsOpen] = useState(false);
  const [currentPromptPreset, setCurrentPromptPreset] = useState<string>('');
  // Connections between cards (Miro-style)
  const [isConnectionMode, setIsConnectionMode] = useState(false);
  const [connectingSourceCardId, setConnectingSourceCardId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  // Style Analysis State (gemini-2.5-flash)
  const [isStyleAnalysisOpen, setIsStyleAnalysisOpen] = useState(false);
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);
  const [styleAnalysisTags, setStyleAnalysisTags] = useState('');
  // Product Library State (localStorage 'aips_products')
  const [productsList, setProductsList] = useState<ProductItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isProductLibraryOpen, setIsProductLibraryOpen] = useState(false);
  // Canvas Image Crop Queue State
  const [canvasCropQueue, setCanvasCropQueue] = useState<CanvasCropQueueItem[]>([]);
  const [canvasCropIndex, setCanvasCropIndex] = useState<number>(0);
  const [pendingCanvasCards, setPendingCanvasCards] = useState<Card[]>([]);
  // Modal & Panel states
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCloudConflictsOpen, setIsCloudConflictsOpen] = useState(false);
  const [isGenerationOpen, setIsGenerationOpen] = useState(false);
  // Tabs: the board, the catalog conveyor, video
  const [studioView, setStudioViewState] = useState<StudioView>(() => {
    try {
      const v = localStorage.getItem('aips_view');
      return v === 'catalog' || v === 'video' || v === 'packaging' ? v : 'board';
    } catch {
      return 'board';
    }
  });
  // Generations in flight (queued + running) and the photos they are made from
  const [activeGenerations, setActiveGenerations] = useState(0);
  const [generatingCardIds, setGeneratingCardIds] = useState<Set<string>>(new Set());
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [dockOrder, setDockOrder] = useState<DockId[]>([]);
  const [dockWidths, setDockWidths] = useState<Record<DockId, number>>(() => {
    const base = { products: 640, ai: 400, menu: 280 };
    try {
      return { ...base, ...JSON.parse(localStorage.getItem('aips_dock_widths') || '{}') };
    } catch {
      return base;
    }
  });
  // Projects column on the left can be hidden on desktop
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('aips_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('aips_sidebar_width')) || 180;
    } catch {
      return 180;
    }
  });
  // Top-bar buttons switched off in the menu
  const [hiddenTools, setHiddenTools] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('aips_hidden_tools') || '[]');
    } catch {
      return [];
    }
  });
  // Undo / redo: every saved change of the board or of the positions is a step
  const undo = useUndo();
  // Status line on top (folder import, cutting, examples…)
  const [folderImportStatus, setFolderImportStatus] = useState<string | null>(null);
  // A dropped / picked folder first asks what it is: products (positions) or photos for the board
  const [pendingFolder, setPendingFolder] = useState<{ files: FolderFile[]; pos?: { x: number; y: number } } | null>(null);
  const [catalogProgress, setCatalogProgress] = useState<{ done: number; total: number } | null>(null);
  const [catalogIncoming, setCatalogIncoming] = useState<{ key: number; items: { name: string; src: string }[] } | null>(null);

  // Tabs, the right dock (products / AI / menu), the projects column and hidden top-bar tools.
  const {
    DOCK_MIN,
    dockOpen,
    dockRef,
    dropFromDock,
    fileInputRef,
    jsonInputRef,
    resizeDock,
    resizeSidebar,
    setStudioView,
    siteMockupInputRef,
    toggleSidebar,
    toggleTool,
  } = useStudioLayout({
    dockOrder,
    isGenerationOpen,
    isProductLibraryOpen,
    isRightDrawerOpen,
    setDockOrder,
    setDockWidths,
    setHiddenTools,
    setIsGenerationOpen,
    setIsMasterPromptsOpen,
    setIsMobileSidebarOpen,
    setIsProductLibraryOpen,
    setIsRightDrawerOpen,
    setIsSidebarCollapsed,
    setIsStyleAnalysisOpen,
    setSidebarWidth,
    setStudioViewState,
  });

  // Loading from IndexedDB, saving with undo, projects, notes and the small board toggles.
  const {
    activeProject,
    handleAddNote,
    handleCreateProject,
    handleDeleteNote,
    handleDeleteProject,
    handleDetachNote,
    handleLogoClick,
    handleRenameProject,
    handleSaveMasterPrompts,
    handleSelectProject,
    handleToggleConnectionMode,
    handleUpdateCards,
    handleUpdateNoteColor,
    handleUpdateNoteSize,
    handleUpdateNoteText,
    handleUpdateNotes,
    handleUpdatePanZoom,
    latestProductsRef,
    latestProjectsRef,
    masterPromptsRef,
    saveProjectsToStorage,
  } = useProjectData({
    activeProjectId,
    masterPrompts,
    productsList,
    projects,
    setActiveProjectIdState,
    setConnectingSourceCardId,
    setIsConnectionMode,
    setIsExportModalOpen,
    setIsGenerationOpen,
    setIsHydrated,
    setIsMasterPromptsOpen,
    setIsProductLibraryOpen,
    setIsRightDrawerOpen,
    setIsSettingsOpen,
    setIsShortcutsOpen,
    setIsStyleAnalysisOpen,
    setMasterPrompts,
    setProjects,
    setSelectedCardIds,
    setSelectedConnectionId,
    setSelectedNoteIds,
    setStorageInfo,
    undo,
  });

  const handleUpdatePackaging = useCallback((packaging: PackagingBrief) => {
    const updated = projects.map((project) => project.id === activeProjectId
      ? { ...project, packaging, updatedAt: Date.now() }
      : project);
    saveProjectsToStorage(updated);
  }, [activeProjectId, projects, saveProjectsToStorage]);

  // Photos and folders coming in: crop queue, folder → board / positions, products dropped on the board.
  const {
    askAboutFolder,
    folderInputRef,
    handleAddFolder,
    handleAddImages,
    handleApplyCropToAllRemaining,
    handleCancelCanvasCrop,
    handleDropProducts,
    handleFolderInputChange,
    handleGenerateSample,
    handleImportFolderAsProducts,
    handleSaveCanvasCrop,
    handleSkipAllAndImportOriginals,
    handleSkipCurrentCanvasCrop,
    pickFolder,
    showOnBoardRef,
  } = useImageImport({
    activeProject,
    activeProjectId,
    canvasCropIndex,
    canvasCropQueue,
    handleUpdateCards,
    pendingCanvasCards,
    productsList,
    projects,
    saveProjectsToStorage,
    setCanvasCropIndex,
    setCanvasCropQueue,
    setFolderImportStatus,
    setIsProductLibraryOpen,
    setPendingCanvasCards,
    setPendingFolder,
    setProductsList,
    setSelectedCardIds,
    setSelectedNoteIds,
    setStorageWarning,
  });

  // Board edits: links, deleting, duplicating, groups, notes that go into prompts, site mockup, export.
  const {
    consideredNotes,
    handleAddConnection,
    handleAddSiteMockupClick,
    handleChangeSiteMockupOpacity,
    handleClearAll,
    handleDeleteCard,
    handleDeleteConnection,
    handleDeleteSelection,
    handleDeleteSiteMockup,
    handleDuplicateCard,
    handleExportImages,
    handleGroupSelected,
    handleRenameGroup,
    handleSiteMockupFileChange,
    handleUngroup,
    handleUpdateSiteMockup,
  } = useBoardEditing({
    activeProject,
    activeProjectId,
    handleUpdateCards,
    handleUpdateNotes,
    projects,
    saveProjectsToStorage,
    selectedCardIds,
    selectedConnectionId,
    selectedNoteIds,
    setSelectedCardIds,
    setSelectedConnectionId,
    setSelectedNoteIds,
    siteMockupInputRef,
  });

  // Gemini: one shot per selected product (references by «берём:» roles), «править», «Стиль».
  const {
    examplePromptNames,
    handleAnalyzeStyle,
    handleChangeCardTakes,
    handleEditCard,
    handleMakeExampleFromCard,
    handleSaveStyleAsMasterPrompt,
    handleTriggerGeminiGeneration,
    handleUseStyleInGeneration,
    quickEditPrompts,
  } = useGeneration({
    activeProject,
    activeProjectId,
    consideredNotes,
    handleSaveMasterPrompts,
    handleUpdateCards,
    latestProjectsRef,
    masterPrompts,
    masterPromptsRef,
    projects,
    saveProjectsToStorage,
    selectedCardIds,
    setActiveGenerations,
    setCurrentPromptPreset,
    setFolderImportStatus,
    setGeneratingCardIds,
    setGenerationError,
    setIsAnalyzingStyle,
    setIsGenerationOpen,
    setIsSettingsOpen,
    setIsStyleAnalysisOpen,
    setSelectedCardIds,
    setSelectedNoteIds,
    setStyleAnalysisTags,
  });

  // Project copy (.json) in and out, image picker button, memory clean-up.
  const {
    handleAddImageClick,
    handleClearMemory,
    handleExportProject,
    handleImportProjectClick,
    handleJsonFileChange,
    handleOptimizeMemory,
  } = useProjectFiles({
    activeProject,
    fileInputRef,
    handleSaveMasterPrompts,
    handleSelectProject,
    jsonInputRef,
    masterPrompts,
    productsList,
    projects,
    saveProjectsToStorage,
    setIsOptimizing,
    setProjects,
    setStorageInfo,
    setStorageWarning,
  });

  // Positions of the active project, axes on the board, «разрезать», board → positions / catalog.
  const {
    handleAddMatrix,
    handleAddProductToCanvas,
    handleCardsDragEnd,
    handleCardsToCatalog,
    handleCardsToMatrix,
    handleCardsToPositions,
    handleCutCard,
    handleDropCardsOnPosition,
    handleDropSlot,
    handleMoveProductsToProject,
    handleSaveProducts,
    handleShowPositionsOnBoard,
    matrixApi,
  } = usePositionsAndAxes({
    activeProject,
    activeProjectId,
    isHydrated,
    latestProductsRef,
    latestProjectsRef,
    productsList,
    projects,
    saveProjectsToStorage,
    setCatalogIncoming,
    setFolderImportStatus,
    setIsProductLibraryOpen,
    setIsSettingsOpen,
    setProductsList,
    setSelectedCardIds,
    setStudioView,
    showOnBoardRef,
    undo,
  });

  // Keyboard: ⌘G, ⌘A, undo / redo, copy / cut / paste of board photos, the file input.
  const {
    handleFileInputChange,
    selectedCardsList,
    selectedGroup,
  } = useBoardShortcuts({
    activeProject,
    activeProjectId,
    fileInputRef,
    handleAddImages,
    handleDeleteSelection,
    handleGroupSelected,
    handleSaveProducts,
    handleUngroup,
    handleUpdateCards,
    latestProductsRef,
    latestProjectsRef,
    projects,
    saveProjectsToStorage,
    selectedCardIds,
    selectedNoteIds,
    setProductsList,
    setProjects,
    setSelectedCardIds,
    setSelectedNoteIds,
    studioView,
    undo,
  });

  return (
    <div
      id="ai-product-photo-studio"
      className="flex flex-col w-screen h-screen overflow-hidden bg-white text-[var(--fg)] font-sans relative"
    >
      {/* Storage Warning Banner (>80%) */}
      {pendingFolder && (() => {
        const groupsIn = groupByFolder(pendingFolder.files);
        const productFolders = groupsIn.filter((g) => g.files.filter((f) => isGenericName(f.file.name)).length / g.files.length >= 0.6).length;
        const looksLikeFolderPerProduct = productFolders > 0 && productFolders >= groupsIn.length * 0.6;
        const choice = (title: string, note: string, onClick: () => void, first = false) => (
          <button className={`w-full text-left p-2 ${first ? 'mt-1' : ''} hover:bg-[var(--fg)] hover:text-white group cursor-pointer`} onClick={onClick}>
            <div className="text-[clamp(20px,1.8vw,26px)] font-medium leading-tight tracking-[-.01em]">{title}</div>
            <div className="text-[12px] text-[var(--grey)] group-hover:text-white/70 leading-snug">{note}</div>
          </button>
        );
        return (
          <div className="fixed inset-0 z-[60] bg-black/40 ofst-fade flex items-center justify-center p-2" onClick={() => setPendingFolder(null)}>
            <div className="w-full max-w-md bg-white p-2" onClick={(e) => e.stopPropagation()}>
              <div className="ofst-run">
                <span>Куда загрузить папку?</span>
                <span>
                  {pendingFolder.files.length} фото · папок {groupsIn.length}
                </span>
              </div>
              <p className="text-[12px] leading-snug pt-1">
                {looksLikeFolderPerProduct
                  ? `Похоже, тут папка = один товар (${productFolders}): файлы названы номерами. Первое фото станет исходником, остальные — ракурсами в колонках.`
                  : 'Похоже, тут файл = один товар: имя файла станет названием, подпапка — группой.'}
              </p>
              {choice(
                'В позиции',
                'Таблица товаров («Продукты») — чистовик для каталога и экспорта. На доске сразу появятся «Оси» с теми же товарами: там удобно разбирать, а «→ в позиции» вернёт порядок обратно. Если позиция уже есть (по коду или названию), фото добавится к ней.',
                () => {
                  const f = pendingFolder.files;
                  setPendingFolder(null);
                  handleImportFolderAsProducts(f);
                },
                true
              )}
              {choice('На доску', 'Свободно разложить и посмотреть: каждая папка станет группой. Потом фото можно перетащить в позиции или выделить и нажать «в позиции».', () => {
                const { files, pos } = pendingFolder;
                setPendingFolder(null);
                handleAddFolder(files, pos);
              })}
              <div className="flex justify-end">
                <button className="ofst-cell ofst-cell--muted" onClick={() => setPendingFolder(null)}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {isDeploymentCopy && (
        <div className="bg-[var(--marker)] text-[var(--fg)] text-[12px] px-2 py-1 z-40 flex items-center justify-between gap-2">
          <span>
            Это адрес одного деплоя. У каждого адреса своя память браузера, поэтому здесь пусто. Твои проекты живут на
            основном адресе.
          </span>
          <a href={`https://${STUDIO_HOME_HOST}`} className="underline shrink-0">
            Открыть основной
          </a>
        </div>
      )}
      <CloudBanner onResolve={() => setIsCloudConflictsOpen(true)} />
      {folderImportStatus && (
        <div className="bg-[var(--fg)] text-white text-[12px] px-2 py-1 z-40">{folderImportStatus}</div>
      )}
      {storageWarning && (
        <div
          id="storage-warning-banner"
          className="bg-[var(--marker)] text-[var(--fg)] text-[12px] px-2 py-1 flex items-center justify-between z-40"
        >
          <div className="flex items-center gap-2 font-medium">
            <span>{storageWarning}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOptimizeMemory}
              disabled={isOptimizing}
              className="underline font-medium"
            >
              {isOptimizing ? 'Сжимаю…' : 'Сжать картинки'}
            </button>
            <button
              onClick={() => setStorageWarning(null)}
              className="underline"
              title="Закрыть"
            >
              ок
            </button>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <TopBar
        projectName={activeProject.name}
        cardCount={
          (activeProject.cards?.length || 0) + (activeProject.notes?.length || 0)
        }
        selectedCount={selectedCardIds.size + selectedNoteIds.size}
        storageInfo={storageInfo}
        onToggleSidebar={toggleSidebar}
        isSidebarCollapsed={isSidebarCollapsed}
        onAddImage={handleAddImageClick}
        onAddFolder={() => pickFolder('ask')}
        onClearAll={handleClearAll}
        onExportProject={handleExportProject}
        onImportProject={handleImportProjectClick}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onGenerateSample={handleGenerateSample}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleGeneration={() => setIsGenerationOpen((prev) => !prev)}
        isGenerationOpen={isGenerationOpen}
        onOptimizeMemory={handleOptimizeMemory}
        onClearMemory={handleClearMemory}
        isOptimizing={isOptimizing}
        onOpenMasterPrompts={() => setIsMasterPromptsOpen(true)}
        isConnectionMode={isConnectionMode}
        onToggleConnectionMode={handleToggleConnectionMode}
        onAnalyzeStyle={handleAnalyzeStyle}
        isAnalyzingStyle={isAnalyzingStyle}
        onToggleProducts={() => setIsProductLibraryOpen((prev) => !prev)}
        isProductsOpen={isProductLibraryOpen}
        onGroupSelected={handleGroupSelected}
        canGroup={selectedCardIds.size > 0}
        onUngroupSelected={selectedGroup ? () => handleUngroup(selectedGroup.id) : undefined}
        onAddSiteMockup={handleAddSiteMockupClick}
        hasSiteMockup={Boolean(activeProject.siteMockup)}
        onExportImages={handleExportImages}
        onOpenRightDrawer={() => setIsRightDrawerOpen((v) => !v)}
        isMenuOpen={isRightDrawerOpen}
        hiddenTools={hiddenTools}
        view={studioView}
        onChangeView={setStudioView}
        onLogoClick={handleLogoClick}
        catalogProgress={catalogProgress}
      />

      {/* Main Workspace: Sidebar + Infinite Canvas */}
      <div className="flex flex-1 h-[calc(100vh-56px)] overflow-hidden relative">
        <Sidebar
          projects={projects}
          activeProjectId={activeProjectId}
          storageInfo={storageInfo}
          onOpenCloud={() => setIsSettingsOpen(true)}
          isMobileOpen={isMobileSidebarOpen}
          isCollapsed={isSidebarCollapsed}
          onCollapse={toggleSidebar}
          width={sidebarWidth}
          onResize={resizeSidebar}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
        />

        <div className="relative flex-1 min-w-0 flex">
        {studioView === 'board' && selectedCardIds.size > 0 && (
          <div
            id="selection-bar"
            className="absolute left-1/2 -translate-x-1/2 bottom-9 z-20 flex items-center bg-white text-[13px] ofst-pop shadow-[0_0_0_1px_var(--soft-2)]"
          >
            <span className="pl-2 pr-1 text-[var(--grey)] tabular-nums">выбрано {selectedCardIds.size}</span>
            <span className="pr-1">
              <Info up>
                «в позиции» — каждое фото станет товаром в «Продуктах». «одним товаром» — все выбранные станут одним товаром: первое (слева
                сверху) — исходник, остальные — ракурсы. «в каталог» — переснять их в одном стиле. «в оси» — разложить по сетке товары × ракурсы.
              </Info>
            </span>
            <button
              className="ofst-cell"
              title="Каждое фото станет отдельной позицией (товаром)"
              onClick={() => handleCardsToPositions(Array.from(selectedCardIds), 'each')}
            >
              в позиции
            </button>
            {selectedCardIds.size > 1 && (
              <button
                className="ofst-cell"
                title="Один товар: первое фото (слева сверху) — исходник, остальные — ракурсы"
                onClick={() => handleCardsToPositions(Array.from(selectedCardIds), 'one')}
              >
                одним товаром
              </button>
            )}
            <button className="ofst-cell" title="Открыть «Каталог» с этими фото как товарами" onClick={() => handleCardsToCatalog(Array.from(selectedCardIds))}>
              в каталог
            </button>
            <button
              className="ofst-cell"
              title="Разложить по осям: каждая группа (или фото) — строка-товар, фото в ней — ракурсы по столбцам"
              onClick={() => handleCardsToMatrix(Array.from(selectedCardIds))}
            >
              в оси
            </button>
            {selectedCardIds.size > 1 && (
              <button className="ofst-cell ofst-cell--muted" title="Сгруппировать (⌘G)" onClick={handleGroupSelected}>
                группа
              </button>
            )}
          </div>
        )}
        {studioView === 'board' && <Canvas
          project={activeProject}
          onAddFolder={askAboutFolder}
          onDeleteSelection={handleDeleteSelection}
          onDropProducts={handleDropProducts}
          onDropSlot={handleDropSlot}
          onChangeCardTakes={handleChangeCardTakes}
          onEditCard={handleEditCard}
          quickEditPrompts={quickEditPrompts}
          generatingCardIds={generatingCardIds}
          onDropCardsOnPosition={isProductLibraryOpen ? handleDropCardsOnPosition : undefined}
          onImportFolder={(kind) => pickFolder(kind)}
          selectedCardIds={selectedCardIds}
          selectedNoteIds={selectedNoteIds}
          pan={activeProject.pan || { x: 80, y: 80 }}
          zoom={activeProject.zoom || 1}
          onUpdatePanZoom={handleUpdatePanZoom}
          onUpdateCards={handleUpdateCards}
          onUpdateNotes={handleUpdateNotes}
          onSelectCards={setSelectedCardIds}
          onSelectNotes={setSelectedNoteIds}
          onDeleteCard={handleDeleteCard}
          onDuplicateCard={handleDuplicateCard}
          onPreviewCard={setPreviewCard}
          onAddImages={handleAddImages}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          onUpdateNoteText={handleUpdateNoteText}
          onUpdateNoteColor={handleUpdateNoteColor}
          onUpdateNoteSize={handleUpdateNoteSize}
          onDetachNote={handleDetachNote}
          isConnectionMode={isConnectionMode}
          onToggleConnectionMode={handleToggleConnectionMode}
          connectingSourceCardId={connectingSourceCardId}
          onSetConnectingSourceCardId={setConnectingSourceCardId}
          onAddConnection={handleAddConnection}
          onDeleteConnection={handleDeleteConnection}
          selectedConnectionId={selectedConnectionId}
          onSelectConnection={setSelectedConnectionId}
          onGroupSelected={handleGroupSelected}
          onUngroup={handleUngroup}
          onRenameGroup={handleRenameGroup}
          onMakeExample={handleMakeExampleFromCard}
          onCutCard={handleCutCard}
          examplePromptNames={examplePromptNames}
          matrixApi={matrixApi}
          onAddMatrix={handleAddMatrix}
          onCardsDragEnd={handleCardsDragEnd}
          onGroupToPosition={(groupId) => {
            const g = (activeProject.groups || []).find((x) => x.id === groupId);
            if (g) handleCardsToPositions(g.children, 'one', g.name);
          }}
          onAnalyzeStyle={handleAnalyzeStyle}
          onUpdateSiteMockup={handleUpdateSiteMockup}
          onDeleteSiteMockup={handleDeleteSiteMockup}
          onChangeSiteMockupOpacity={handleChangeSiteMockupOpacity}
        />}

        {/* Kept alive on every tab, so a run keeps going while you work on the board */}
        {(
          <CatalogStudio
            isOpen={studioView === 'catalog'}
            onProgress={setCatalogProgress}
            onClose={() => setStudioView('board')}
            projectId={activeProject.id}
            projectName={activeProject.name}
            products={productsList}
            selectedCards={selectedCardsList}
            boardCards={activeProject.cards || []}
            masterPrompts={masterPrompts}
            onSaveMasterPrompts={handleSaveMasterPrompts}
            onOpenSettings={() => setIsSettingsOpen(true)}
            incomingItems={catalogIncoming}
          />
        )}
        {studioView === 'video' && <VideoTab projectName={activeProject.name} />}
        {studioView === 'packaging' && (
          <PackagingStudio
            projectName={activeProject.name}
            brief={activeProject.packaging}
            boardCards={activeProject.cards || []}
            onChange={handleUpdatePackaging}
            onGoToBoard={() => setStudioView('board')}
          />
        )}
        </div>
      </div>


      {/* Dock: side panels stand in one row on the right. The newest opens at the edge and pushes the
          older ones left; they squeeze down to a minimum width, then the row scrolls sideways (swipe on phones). */}
      {dockOrder.length > 0 && (
        <div
          id="studio-dock"
          ref={dockRef}
          style={{ ['--sb-w' as string]: `${isSidebarCollapsed ? 0 : sidebarWidth}px` }}
          className={`fixed top-10 right-0 bottom-0 z-40 flex max-w-full md:max-w-[calc(100vw-var(--sb-w))] overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory md:snap-none custom-scrollbar`}
        >
          {dockOrder.map((id) => (
            <DockSlot
              key={id}
              id={id}
              open={dockOpen[id]}
              width={dockWidths[id]}
              minWidth={DOCK_MIN[id]}
              onResize={(w) => resizeDock(id, w)}
              onClosed={() => dropFromDock(id)}
            >
              {id === 'products' && (
                <ProductLibraryDrawer
                  isOpen={true}
                  onClose={() => setIsProductLibraryOpen(false)}
                  products={productsList}
                  onSaveProducts={handleSaveProducts}
                  onAddProductToCanvas={handleAddProductToCanvas}
                  onShowOnBoard={handleShowPositionsOnBoard}
                  projectName={activeProject.name}
                  otherProjects={projects.filter((p) => p.id !== activeProjectId).map((p) => ({ id: p.id, name: p.name }))}
                  onMoveToProject={handleMoveProductsToProject}
                />
              )}
              {id === 'ai' && (
                <GenerationPanel
                  isOpen={true}
                  onClose={() => setIsGenerationOpen(false)}
                  selectedCards={selectedCardsList}
                  consideredNotes={consideredNotes}
                  onDeselectCard={(id) => {
                    setSelectedCardIds((prev) => {
                      const next = new Set(prev);
                      next.delete(id);
                      return next;
                    });
                  }}
                  onGenerate={handleTriggerGeminiGeneration}
                  activeGenerations={activeGenerations}
                  errorMessage={generationError}
                  onClearError={() => setGenerationError(null)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  masterPrompts={masterPrompts}
                  projectId={activeProject.id}
                  onOpenMasterPrompts={() => setIsMasterPromptsOpen(true)}
                  currentPromptPreset={currentPromptPreset}
                  products={productsList}
                  onOpenProducts={() => setIsProductLibraryOpen(true)}
                />
              )}
              {id === 'menu' && (
                <RightDrawer
                  isOpen={true}
                  onClose={() => setIsRightDrawerOpen(false)}
                  storageInfo={storageInfo}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onAnalyzeStyle={handleAnalyzeStyle}
                  isAnalyzingStyle={isAnalyzingStyle}
                  onToggleProducts={() => setIsProductLibraryOpen((v) => !v)}
                  isProductsOpen={isProductLibraryOpen}
                  onOpenMasterPrompts={() => setIsMasterPromptsOpen(true)}
                  isConnectionMode={isConnectionMode}
                  onToggleConnectionMode={handleToggleConnectionMode}
                  onAddSiteMockup={handleAddSiteMockupClick}
                  hasSiteMockup={Boolean(activeProject.siteMockup)}
                  onExportImages={handleExportImages}
                  onExportProject={handleExportProject}
                  onImportProject={handleImportProjectClick}
                  onOpenExportModal={() => setIsExportModalOpen(true)}
                  onOptimizeMemory={handleOptimizeMemory}
                  onClearMemory={handleClearMemory}
                  onClearAll={handleClearAll}
                  isOptimizing={isOptimizing}
                  onToggleGeneration={() => setIsGenerationOpen((v) => !v)}
                  isGenerationOpen={isGenerationOpen}
                  toolLabels={TOOL_LABELS}
                  hiddenTools={hiddenTools}
                  onToggleTool={toggleTool}
                />
              )}
            </DockSlot>
          ))}
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        id="hidden-global-file-input"
        accept="image/*,.heic,.heif"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />
      <input
        type="file"
        ref={folderInputRef}
        id="hidden-folder-input"
        multiple
        {...({ webkitdirectory: '' } as Record<string, string>)}
        onChange={handleFolderInputChange}
        className="hidden"
      />
      <input
        type="file"
        ref={jsonInputRef}
        id="hidden-json-file-input"
        accept=".json"
        onChange={handleJsonFileChange}
        className="hidden"
      />
      <input
        type="file"
        ref={siteMockupInputRef}
        id="hidden-site-mockup-file-input"
        accept="image/*,.heic,.heif"
        onChange={handleSiteMockupFileChange}
        className="hidden"
      />

      {/* Modals */}
      <MasterPromptsModal
        isOpen={isMasterPromptsOpen}
        onClose={() => setIsMasterPromptsOpen(false)}
        masterPrompts={masterPrompts}
        projectId={activeProject.id}
        projectName={activeProject.name}
        onSaveMasterPrompts={handleSaveMasterPrompts}
        onSelectPromptForGen={(promptText) => {
          setCurrentPromptPreset(promptText);
          setIsGenerationOpen(true);
          setIsMasterPromptsOpen(false);
        }}
        selectedCards={selectedCardsList}
        onTryPrompt={(mp) => handleTriggerGeminiGeneration(mp.prompt, { masterPromptName: mp.name, exampleForPromptId: mp.id })}
      />

      <StyleAnalysisModal
        isOpen={isStyleAnalysisOpen}
        onClose={() => setIsStyleAnalysisOpen(false)}
        tagsText={styleAnalysisTags}
        isLoading={isAnalyzingStyle}
        onSaveAsMasterPrompt={handleSaveStyleAsMasterPrompt}
        onUseInGeneration={handleUseStyleInGeneration}
      />


      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={() => setGenerationError(null)}
        onShowConflicts={() => setIsCloudConflictsOpen(true)}
      />
      {isCloudConflictsOpen && <CloudConflictsWindow onClose={() => setIsCloudConflictsOpen(false)} />}

      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        project={activeProject}
        onClose={() => setIsExportModalOpen(false)}
      />

      <ImagePreviewModal
        card={previewCard}
        onClose={() => setPreviewCard(null)}
      />



      {/* Image Crop Modal for Canvas Uploads / Drops */}
      {canvasCropQueue.length > 0 && canvasCropIndex < canvasCropQueue.length && (
        <ImageCropModal
          isOpen={true}
          imageSrc={canvasCropQueue[canvasCropIndex].rawSrc}
          imageName={canvasCropQueue[canvasCropIndex].name}
          initialAspectRatio="original"
          queueInfo={{
            current: canvasCropIndex + 1,
            total: canvasCropQueue.length,
            fileName: canvasCropQueue[canvasCropIndex].name,
          }}
          onSave={handleSaveCanvasCrop}
          onCancel={handleCancelCanvasCrop}
          onApplyToAllRemaining={handleApplyCropToAllRemaining}
          onSkipAllAndImportOriginals={handleSkipAllAndImportOriginals}
          onSkipCurrent={handleSkipCurrentCanvasCrop}
        />
      )}
    </div>
  );
}
