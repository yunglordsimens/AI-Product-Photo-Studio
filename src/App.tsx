import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Card,
  CardGroup,
  Connection,
  MasterPrompt,
  Note,
  NoteColor,
  ProductItem,
  Project,
  SiteMockup,
  StorageInfo,
  BoardMatrix,
} from './types';
import {
  loadProjects,
  loadProjectsAsync,
  saveProjects,
  getActiveProjectId,
  setActiveProjectId,
  getStorageUsage,
  getStorageUsageAsync,
  exportProjectToJson,
  parseProjectJson,
  mergeMasterPrompts,
  clearAllMemory,
  optimizeAllProjectsMemory,
  loadMasterPrompts,
  loadMasterPromptsAsync,
  saveMasterPrompts,
  loadProjectProducts,
  saveProjectProducts,
  appendProductsToProject,
  requestPersistentStorage,
} from './utils/storage';
import { compressAndLoadImage, compressDataUrl, createSampleCard } from './utils/imageUtils';
import { getStoredApiKey, hasGenerationAccess, generateImageWithGemini, analyzeStyleWithGemini, getImageModel } from './utils/gemini';
import { SOURCE_FIX_MARKER } from './utils/storage';
import { isImageFile, normalizeImageFiles } from './utils/heic';
import { FolderFile, groupByFolder, folderFilesFromInput, snapshotFolderFiles } from './utils/folderImport';
import { ensureVariantCols, folderImportNote, importFolderToPositions, isGenericName, splitSku } from './utils/positionsImport';
import { MATRIX_LABEL_H, MATRIX_LABEL_W, addLine, isOverMatrix, matrixFromGroups, matrixToPositionDrafts, membersOf, newMatrix, removeLine, snapIntoMatrix, transposeMatrix } from './utils/matrix';
import type { MatrixApi } from './components/BoardMatrixView';
import { TopBar, TOOL_LABELS, StudioView } from './components/TopBar';
import { VideoTab } from './components/VideoTab';
import { useUndo } from './hooks/useUndo';
import { copyPictureToSystem } from './utils/clipboard';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ExportModal } from './components/ExportModal';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { SettingsModal } from './components/SettingsModal';
import { GenerationPanel, ConsideredNoteInfo } from './components/GenerationPanel';
import { MasterPromptsModal } from './components/MasterPromptsModal';
import { StyleAnalysisModal } from './components/StyleAnalysisModal';
import { ProductLibraryDrawer } from './components/ProductLibraryDrawer';
import { compressImageDataUrl } from './utils/storage';
import { ImageCropModal, CropAspectRatio, cropRatioValue } from './components/ImageCropModal';
import { RightDrawer } from './components/RightDrawer';
import { DockSlot } from './components/DockSlot';
import { CatalogStudio } from './components/CatalogStudio';
import { Info } from './components/Info';

interface CanvasCropQueueItem {
  id: string;
  name: string;
  rawSrc: string;
  atCanvasPos?: { x: number; y: number };
}

// Helper to calculate Euclidean distance between two bounding boxes
function getDistanceBetweenRects(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number }
): number {
  const dx = Math.max(0, Math.max(r1.x - (r2.x + r2.width), r2.x - (r1.x + r1.width)));
  const dy = Math.max(0, Math.max(r1.y - (r2.y + r2.height), r2.y - (r1.y + r1.height)));
  return Math.sqrt(dx * dx + dy * dy);
}

/** Main address of the studio. Every deployment also gets its own one-off address with a separate, empty browser storage. */
const STUDIO_HOME_HOST = 'ai-product-photo-studio-seven.vercel.app';
const isDeploymentCopy =
  typeof window !== 'undefined' &&
  window.location.hostname.endsWith('.vercel.app') &&
  window.location.hostname !== STUDIO_HOME_HOST;

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
  const [isGenerationOpen, setIsGenerationOpen] = useState(false);
  // Tabs: the board, the catalog conveyor, video
  const [studioView, setStudioViewState] = useState<StudioView>(() => {
    try {
      const v = localStorage.getItem('aips_view');
      return v === 'catalog' || v === 'video' ? v : 'board';
    } catch {
      return 'board';
    }
  });
  // Switching tabs folds the side panels (products, prompts, AI, menu) so nothing stays layered on top.
  // The projects column stays: it only hides with «скрыть».
  const setStudioView = useCallback((v: StudioView) => {
    setStudioViewState((prev) => {
      if (prev !== v) {
        setIsProductLibraryOpen(false);
        setIsGenerationOpen(false);
        setIsRightDrawerOpen(false);
        setIsMasterPromptsOpen(false);
        setIsStyleAnalysisOpen(false);
      }
      return v;
    });
    try {
      localStorage.setItem('aips_view', v);
    } catch {}
  }, []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  // Hidden file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const siteMockupInputRef = useRef<HTMLInputElement>(null);

  // Which side panels are open, in the order they were opened (for the dock)
  type DockId = 'products' | 'ai' | 'menu';
  const [dockOrder, setDockOrder] = useState<DockId[]>([]);
  const dockRef = useRef<HTMLDivElement>(null);
  const dockOpen: Record<DockId, boolean> = { products: isProductLibraryOpen, ai: isGenerationOpen, menu: isRightDrawerOpen };
  // Newly opened panels join at the right edge; closed ones stay until their closing animation ends
  useEffect(() => {
    setDockOrder((prev) => [...prev, ...(Object.keys(dockOpen) as DockId[]).filter((id) => dockOpen[id] && !prev.includes(id))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProductLibraryOpen, isGenerationOpen, isRightDrawerOpen]);
  const dropFromDock = useCallback(
    (id: DockId) => setDockOrder((prev) => prev.filter((x) => x !== id || dockOpenRef.current[id])),
    []
  );
  const dockOpenRef = useRef(dockOpen);
  dockOpenRef.current = dockOpen;
  const DOCK_MIN: Record<DockId, number> = { products: 420, ai: 340, menu: 240 };
  const [dockWidths, setDockWidths] = useState<Record<DockId, number>>(() => {
    const base = { products: 640, ai: 400, menu: 280 };
    try {
      return { ...base, ...JSON.parse(localStorage.getItem('aips_dock_widths') || '{}') };
    } catch {
      return base;
    }
  });
  const resizeDock = useCallback((id: DockId, w: number) => {
    setDockWidths((prev) => {
      const next = { ...prev, [id]: w };
      try {
        localStorage.setItem('aips_dock_widths', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

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
  const resizeSidebar = useCallback((w: number) => {
    setSidebarWidth(w);
    try {
      localStorage.setItem('aips_sidebar_width', String(w));
    } catch {}
  }, []);
  const toggleSidebar = useCallback(() => {
    if (window.innerWidth < 768) {
      setIsMobileSidebarOpen((prev) => !prev);
      return;
    }
    setIsSidebarCollapsed((prev) => {
      try {
        localStorage.setItem('aips_sidebar_collapsed', prev ? '0' : '1');
      } catch {}
      return !prev;
    });
  }, []);
  // A newly opened panel comes into view at the right edge
  useEffect(() => {
    const el = dockRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [dockOrder]);

  // Top-bar buttons switched off in the menu
  const [hiddenTools, setHiddenTools] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('aips_hidden_tools') || '[]');
    } catch {
      return [];
    }
  });
  const toggleTool = useCallback((id: string) => {
    setHiddenTools((prev) => {
      const next = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      try {
        localStorage.setItem('aips_hidden_tools', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Initial Data Load with IndexedDB hydration & auto-migration
  useEffect(() => {
    // 1. Fast sync initial state
    const fastProjects = loadProjects();
    setProjects(fastProjects);
    const activeId = getActiveProjectId(fastProjects);
    setActiveProjectIdState(activeId);
    setMasterPrompts(loadMasterPrompts());
    setStorageInfo(getStorageUsage());

    // Ask the browser to keep the studio's data even when the disk fills up
    requestPersistentStorage();

    // 2. Full IndexedDB async hydration
    let isMounted = true;
    (async () => {
      try {
        const [asyncProjects, asyncPrompts, asyncStorage] = await Promise.all([
          loadProjectsAsync(),
          loadMasterPromptsAsync(),
          getStorageUsageAsync(),
        ]);
        if (isMounted) {
          if (asyncProjects && asyncProjects.length > 0) {
            setProjects(asyncProjects);
            const currentActive = getActiveProjectId(asyncProjects);
            setActiveProjectIdState(currentActive);
          }
          if (asyncPrompts && asyncPrompts.length > 0) {
            setMasterPrompts(asyncPrompts);
          }
          setIsHydrated(true);
          if (asyncStorage) {
            setStorageInfo(asyncStorage);
          }
          setStorageInfo(await getStorageUsageAsync());
        }
      } catch (err) {
        console.warn('Async IndexedDB hydration error:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Save Master Prompts
  const handleSaveMasterPrompts = useCallback((prompts: MasterPrompt[]) => {
    setMasterPrompts(prompts);
    saveMasterPrompts(prompts);
  }, []);

  // Toggle Connection Mode
  // Links mode needs the board: turning it on folds the AI and positions panels
  const handleToggleConnectionMode = useCallback(() => {
    setIsConnectionMode((prev) => {
      if (prev) {
        setConnectingSourceCardId(null);
        setSelectedConnectionId(null);
      } else {
        setIsGenerationOpen(false);
        setIsProductLibraryOpen(false);
      }
      return !prev;
    });
  }, []);

  /** The logo: fold every side panel and window; the projects column stays as it is */
  const handleLogoClick = useCallback(() => {
    setIsGenerationOpen(false);
    setIsProductLibraryOpen(false);
    setIsRightDrawerOpen(false);
    setIsMasterPromptsOpen(false);
    setIsStyleAnalysisOpen(false);
    setIsSettingsOpen(false);
    setIsExportModalOpen(false);
    setIsShortcutsOpen(false);
    setIsConnectionMode(false);
    setConnectingSourceCardId(null);
  }, []);

  // Sync to IndexedDB Storage
  // ---- Undo / redo: every saved change of the board or of the positions is a step ----
  const undo = useUndo();
  const latestProjectsRef = useRef(projects);
  latestProjectsRef.current = projects;
  const latestProductsRef = useRef(productsList);
  latestProductsRef.current = productsList;

  const saveProjectsToStorage = useCallback((updatedProjects: Project[]) => {
    undo.record({ kind: 'board', state: latestProjectsRef.current });
    setProjects(updatedProjects);
    saveProjects(updatedProjects);
    // Asynchronously refresh accurate storage usage
    getStorageUsageAsync().then((usage) => {
      if (usage) setStorageInfo(usage);
    }).catch(() => {
      setStorageInfo(getStorageUsage());
    });
  }, [undo]);

  // Active Project Reference
  const activeProject =
    projects.find((p) => p.id === activeProjectId) ||
    projects[0] || {
      id: 'default',
      name: 'Новый проект',
      cards: [],
      notes: [],
      connections: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pan: { x: 80, y: 80 },
      zoom: 1,
    };

  // Switch Active Project
  const handleSelectProject = useCallback((id: string) => {
    setActiveProjectIdState(id);
    setActiveProjectId(id);
    setSelectedCardIds(new Set());
    setSelectedNoteIds(new Set());
    setSelectedConnectionId(null);
    setConnectingSourceCardId(null);
  }, []);

  // Create Project
  const handleCreateProject = useCallback(() => {
    const defaultName = `Проект ${projects.length + 1}`;
    const name = window.prompt('Введите название нового проекта:', defaultName);
    if (!name || !name.trim()) return;

    const newProject: Project = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: name.trim(),
      cards: [],
      notes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pan: { x: 80, y: 80 },
      zoom: 1,
    };

    const updated = [...projects, newProject];
    saveProjectsToStorage(updated);
    handleSelectProject(newProject.id);
  }, [projects, saveProjectsToStorage, handleSelectProject]);

  // Delete Project
  const handleDeleteProject = useCallback(
    (id: string) => {
      if (projects.length <= 1) {
        window.alert('Нельзя удалить единственный проект');
        return;
      }

      const projToDelete = projects.find((p) => p.id === id);
      const confirmDelete = window.confirm(
        `Удалить проект "${projToDelete?.name || 'Без имени'}" и все его карточки?`
      );
      if (!confirmDelete) return;

      const filtered = projects.filter((p) => p.id !== id);
      saveProjectsToStorage(filtered);

      if (activeProjectId === id) {
        const nextActive = filtered[0]?.id || '';
        handleSelectProject(nextActive);
      }
    },
    [projects, activeProjectId, saveProjectsToStorage, handleSelectProject]
  );

  // Rename Project
  const handleRenameProject = useCallback(
    (id: string, newName: string) => {
      const updated = projects.map((p) => {
        if (p.id === id) {
          return { ...p, name: newName, updatedAt: Date.now() };
        }
        return p;
      });
      saveProjectsToStorage(updated);
    },
    [projects, saveProjectsToStorage]
  );

  // Update Pan and Zoom for active project
  const handleUpdatePanZoom = useCallback(
    (pan: { x: number; y: number }, zoom: number) => {
      // Built from the latest state, so a pan right after adding photos never saves an older list
      setProjects((prev) => {
        const updated = prev.map((p) => (p.id === activeProjectId ? { ...p, pan, zoom } : p));
        saveProjects(updated);
        return updated;
      });
    },
    [activeProjectId]
  );

  // Update Cards in active project
  const handleUpdateCards = useCallback(
    (cards: Card[]) => {
      const updated = projects.map((p) => {
        if (p.id === activeProjectId) {
          return { ...p, cards, updatedAt: Date.now() };
        }
        return p;
      });
      saveProjectsToStorage(updated);
    },
    [activeProjectId, projects, saveProjectsToStorage]
  );

  // Update Notes in active project
  const handleUpdateNotes = useCallback(
    (notes: Note[]) => {
      const updated = projects.map((p) => {
        if (p.id === activeProjectId) {
          return { ...p, notes, updatedAt: Date.now() };
        }
        return p;
      });
      saveProjectsToStorage(updated);
    },
    [activeProjectId, projects, saveProjectsToStorage]
  );

  // Add Note
  const handleAddNote = useCallback(
    (note: Note) => {
      const currentNotes = activeProject.notes || [];
      const updated = [...currentNotes, note];
      handleUpdateNotes(updated);
    },
    [activeProject.notes, handleUpdateNotes]
  );

  // Delete Note
  const handleDeleteNote = useCallback(
    (noteId: string) => {
      const currentNotes = activeProject.notes || [];
      const filtered = currentNotes.filter((n) => n.id !== noteId);
      handleUpdateNotes(filtered);
      setSelectedNoteIds((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
    },
    [activeProject.notes, handleUpdateNotes]
  );

  // Update Note Text
  const handleUpdateNoteText = useCallback(
    (noteId: string, text: string) => {
      const currentNotes = activeProject.notes || [];
      const updated = currentNotes.map((n) => (n.id === noteId ? { ...n, text } : n));
      handleUpdateNotes(updated);
    },
    [activeProject.notes, handleUpdateNotes]
  );

  // Update Note Color
  const handleUpdateNoteColor = useCallback(
    (noteId: string, color: NoteColor) => {
      const currentNotes = activeProject.notes || [];
      const updated = currentNotes.map((n) => (n.id === noteId ? { ...n, color } : n));
      handleUpdateNotes(updated);
    },
    [activeProject.notes, handleUpdateNotes]
  );

  // Update Note Size
  const handleUpdateNoteSize = useCallback(
    (noteId: string, width: number, height: number) => {
      const currentNotes = activeProject.notes || [];
      const updated = currentNotes.map((n) =>
        n.id === noteId ? { ...n, width, height } : n
      );
      handleUpdateNotes(updated);
    },
    [activeProject.notes, handleUpdateNotes]
  );

  // Detach Note from Card
  const handleDetachNote = useCallback(
    (noteId: string) => {
      const currentNotes = activeProject.notes || [];
      const updated = currentNotes.map((n) =>
        n.id === noteId ? { ...n, attachedTo: null } : n
      );
      handleUpdateNotes(updated);
    },
    [activeProject.notes, handleUpdateNotes]
  );

  // Add Image Files to Canvas via Sequential Crop Queue
  const handleAddImages = useCallback(
    async (files: File[], atCanvasPos?: { x: number; y: number }) => {
      const currentStorage = getStorageUsage();
      if (currentStorage.percentage >= 80) {
        setStorageWarning('Память почти заполнена (>80%). Нажмите «Оптимизировать память»');
      }

      const imageFiles = (await normalizeImageFiles(files.filter(isImageFile))).filter(
        (f) => f.type.startsWith('image/') || f.name.match(/\.(png|jpe?g|webp|gif|svg|avif)$/i)
      );
      if (imageFiles.length === 0) return;

      const queueItems: CanvasCropQueueItem[] = [];

      for (const file of imageFiles) {
        try {
          const rawSrc = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          queueItems.push({
            id: `crop_item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            name: file.name,
            rawSrc,
            atCanvasPos,
          });
        } catch (err) {
          console.error('Failed to read image file for crop queue:', err);
        }
      }

      if (queueItems.length > 0) {
        setCanvasCropQueue(queueItems);
        setCanvasCropIndex(0);
        setPendingCanvasCards([]);
      }
    },
    []
  );

  // Folder import: no crop queue; one group per subfolder, laid out as blocks
  const [folderImportStatus, setFolderImportStatus] = useState<string | null>(null);
  const handleAddFolder = useCallback(
    async (folderFiles: FolderFile[], atCanvasPos?: { x: number; y: number }) => {
      if (folderFiles.length === 0) return;
      const groupsIn = groupByFolder(folderFiles);
      const CARD_W = 200;
      const GAP = 24;
      const COLS = 6;
      const groupColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#84cc16'];
      const startX = atCanvasPos?.x ?? (-(activeProject.pan?.x || 80) + 120) / (activeProject.zoom || 1);
      let cursorY = atCanvasPos?.y ?? (-(activeProject.pan?.y || 80) + 120) / (activeProject.zoom || 1);
      const existingCards = activeProject.cards || [];
      let z = existingCards.reduce((m, c) => Math.max(m, c.zIndex || 1), 1);
      const newCards: Card[] = [];
      const newGroups: CardGroup[] = [];
      let done = 0;
      const total = folderFiles.length;

      for (let gi = 0; gi < groupsIn.length; gi++) {
        const g = groupsIn[gi];
        const files = await normalizeImageFiles(g.files.map((f) => f.file));
        const rowHeights: number[] = [];
        const groupCardIds: string[] = [];
        for (let i = 0; i < files.length; i++) {
          setFolderImportStatus(`Загружаю ${++done} из ${total}: ${g.name}`);
          const raw = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(files[i]);
          }).catch(() => '');
          if (!raw) continue;
          const src = await compressDataUrl(raw, 1024, 1024, 0.85);
          const dims = await new Promise<{ w: number; h: number }>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
            img.onerror = () => resolve({ w: 4, h: 3 });
            img.src = src;
          });
          const h = Math.round(CARD_W * (dims.h / dims.w));
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          const rowTop = cursorY + rowHeights.slice(0, row).reduce((a, b) => a + b + GAP + 34, 0);
          rowHeights[row] = Math.max(rowHeights[row] || 0, h);
          const card: Card = {
            id: `card_dir_${Date.now()}_${gi}_${i}_${Math.random().toString(36).substr(2, 4)}`,
            x: Math.round(startX + col * (CARD_W + GAP)),
            y: Math.round(rowTop),
            width: CARD_W,
            height: h,
            src,
            name: files[i].name.replace(/\.[^.]+$/, ''),
            aspectRatio: CARD_W / h,
            zIndex: ++z,
          };
          newCards.push(card);
          groupCardIds.push(card.id);
        }
        if (groupCardIds.length > 0) {
          newGroups.push({
            id: `group_dir_${Date.now()}_${gi}_${Math.random().toString(36).substr(2, 4)}`,
            type: 'group',
            name: g.name.split(' / ').map((part, k, arr) => (k === arr.length - 1 ? splitSku(part).name : part)).join(' / '),
            children: groupCardIds,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            color: groupColors[gi % groupColors.length],
          });
        }
        const blockHeight = rowHeights.reduce((a, b) => a + b + GAP + 34, 0);
        cursorY += blockHeight + 110;
      }

      setFolderImportStatus(null);
      saveProjectsToStorage(
        projects.map((p) =>
          p.id === activeProjectId
            ? {
                ...p,
                cards: [...(p.cards || []), ...newCards],
                groups: [...(p.groups || []), ...newGroups],
                updatedAt: Date.now(),
              }
            : p
        )
      );
    },
    [activeProject, activeProjectId, projects, saveProjectsToStorage]
  );

  // A dropped / picked folder first asks what it is: products (positions) or photos for the board
  const [pendingFolder, setPendingFolder] = useState<{ files: FolderFile[]; pos?: { x: number; y: number } } | null>(null);
  const askAboutFolder = useCallback((files: FolderFile[], pos?: { x: number; y: number }) => {
    if (files.length > 0) setPendingFolder({ files, pos });
  }, []);

  const handleImportFolderAsProducts = useCallback(
    async (folderFiles: FolderFile[]) => {
      const r = await importFolderToPositions(folderFiles, productsList, (done, total, label) =>
        setFolderImportStatus(`Позиции: ${done} из ${total} — ${label}`)
      );
      setProductsList(r.next);
      saveProjectProducts(activeProjectId, r.next);
      if (r.maxPhotos > 1) ensureVariantCols(r.maxPhotos - 1);
      setFolderImportStatus(folderImportNote(r));
      setTimeout(() => setFolderImportStatus(null), 8000);
      setIsProductLibraryOpen(true);
    },
    [productsList, activeProjectId]
  );

  const folderInputRef = useRef<HTMLInputElement>(null);
  const folderModeRef = useRef<'ask' | 'products' | 'board'>('ask');
  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    const mode = folderModeRef.current;
    folderModeRef.current = 'ask';
    if (files.length === 0) return;
    // read into memory first: the files must stay readable while the «куда?» question is open
    const ff = await snapshotFolderFiles(folderFilesFromInput(files));
    e.target.value = '';
    if (mode === 'products') await handleImportFolderAsProducts(ff);
    else if (mode === 'board') await handleAddFolder(ff);
    else askAboutFolder(ff);
  };
  const pickFolder = (mode: 'ask' | 'products' | 'board') => {
    folderModeRef.current = mode;
    folderInputRef.current?.click();
  };

  // Products dragged from the library onto the board: a column of named cards
  const handleDropProducts = useCallback(
    async (ids: string[], pos: { x: number; y: number }) => {
      const picked = productsList.filter((p) => ids.includes(p.id) && p.photoDataUrl);
      if (picked.length === 0) return;
      const CARD_W = 220;
      let y = pos.y;
      let z = (activeProject.cards || []).reduce((m, c) => Math.max(m, c.zIndex || 1), 1);
      const cards: Card[] = [];
      for (const prod of picked) {
        const dims = await new Promise<{ w: number; h: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
          img.onerror = () => resolve({ w: 1, h: 1 });
          img.src = prod.photoDataUrl;
        });
        const h = Math.round(CARD_W * (dims.h / dims.w));
        cards.push({
          id: `card_prod_${prod.id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          x: Math.round(pos.x),
          y: Math.round(y),
          width: CARD_W,
          height: h,
          src: prod.photoDataUrl,
          name: prod.name,
          aspectRatio: CARD_W / h,
          zIndex: ++z,
        });
        y += h + 60;
      }
      handleUpdateCards([...(activeProject.cards || []), ...cards]);
    },
    [productsList, activeProject, handleUpdateCards]
  );

  // Save current cropped canvas image and proceed to next in queue
  const handleSaveCanvasCrop = useCallback(
    (croppedDataUrl: string, croppedWidth: number, croppedHeight: number) => {
      const currentItem = canvasCropQueue[canvasCropIndex];
      if (!currentItem) return;

      const currentCards = activeProject.cards || [];
      const totalCreated = pendingCanvasCards.length;

      let posX = currentItem.atCanvasPos
        ? currentItem.atCanvasPos.x + totalCreated * 35
        : 150 + totalCreated * 35;
      let posY = currentItem.atCanvasPos
        ? currentItem.atCanvasPos.y + totalCreated * 35
        : 150 + totalCreated * 35;

      const cardWidth = Math.min(300, Math.max(180, croppedWidth));
      const cardHeight = Math.round(cardWidth * (croppedHeight / croppedWidth)) || 240;
      const maxZ = currentCards.reduce((max, c) => Math.max(max, c.zIndex || 1), 1);

      const newCard: Card = {
        id: `card_${Date.now()}_${totalCreated}_${Math.random().toString(36).substr(2, 5)}`,
        x: Math.round(posX),
        y: Math.round(posY),
        width: cardWidth,
        height: cardHeight,
        src: croppedDataUrl,
        name: currentItem.name,
        aspectRatio: croppedWidth / croppedHeight,
        zIndex: maxZ + 1 + totalCreated,
      };

      const newPending = [...pendingCanvasCards, newCard];
      setPendingCanvasCards(newPending);

      const nextIndex = canvasCropIndex + 1;
      if (nextIndex < canvasCropQueue.length) {
        setCanvasCropIndex(nextIndex);
      } else {
        // Queue finished! Commit all created cards to project
        const mergedCards = [...currentCards, ...newPending];
        handleUpdateCards(mergedCards);

        const newIds = new Set(newPending.map((c) => c.id));
        setSelectedCardIds(newIds);
        setSelectedNoteIds(new Set());

        setCanvasCropQueue([]);
        setCanvasCropIndex(0);
        setPendingCanvasCards([]);

        setTimeout(() => {
          const updatedUsage = getStorageUsage();
          if (updatedUsage.percentage >= 80) {
            setStorageWarning('Память почти заполнена (>80%). Нажмите «Оптимизировать память»');
          }
        }, 100);
      }
    },
    [canvasCropQueue, canvasCropIndex, pendingCanvasCards, activeProject.cards, handleUpdateCards]
  );

  // Cancel current item crop in queue
  const handleCancelCanvasCrop = useCallback(() => {
    const nextIndex = canvasCropIndex + 1;
    if (nextIndex < canvasCropQueue.length) {
      setCanvasCropIndex(nextIndex);
    } else {
      // Queue finished! If some cards were previously saved in this batch, commit them
      if (pendingCanvasCards.length > 0) {
        const currentCards = activeProject.cards || [];
        const mergedCards = [...currentCards, ...pendingCanvasCards];
        handleUpdateCards(mergedCards);

        const newIds = new Set(pendingCanvasCards.map((c) => c.id));
        setSelectedCardIds(newIds);
        setSelectedNoteIds(new Set());
      }
      setCanvasCropQueue([]);
      setCanvasCropIndex(0);
      setPendingCanvasCards([]);
    }
  }, [canvasCropQueue.length, canvasCropIndex, pendingCanvasCards, activeProject.cards, handleUpdateCards]);

  // Apply chosen aspect ratio crop to all remaining photos in batch queue
  const handleApplyCropToAllRemaining = useCallback(
    async (aspectRatio: CropAspectRatio) => {
      const remainingItems = canvasCropQueue.slice(canvasCropIndex);
      if (remainingItems.length === 0) return;

      const currentCards = activeProject.cards || [];
      const newCards: Card[] = [...pendingCanvasCards];
      const maxZ = currentCards.reduce((max, c) => Math.max(max, c.zIndex || 1), 1);

      for (let i = 0; i < remainingItems.length; i++) {
        const item = remainingItems[i];
        const totalCreated = newCards.length;

        const posX = item.atCanvasPos
          ? item.atCanvasPos.x + totalCreated * 35
          : 150 + totalCreated * 35;
        const posY = item.atCanvasPos
          ? item.atCanvasPos.y + totalCreated * 35
          : 150 + totalCreated * 35;

        try {
          const cropped = await new Promise<{ src: string; width: number; height: number }>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              const targetRatio: number | null = cropRatioValue(aspectRatio);

              let sx = 0;
              let sy = 0;
              let sw = img.naturalWidth;
              let sh = img.naturalHeight;

              if (targetRatio !== null) {
                if (sw / sh > targetRatio) {
                  const newW = Math.round(sh * targetRatio);
                  sx = Math.round((sw - newW) / 2);
                  sw = newW;
                } else {
                  const newH = Math.round(sw / targetRatio);
                  sy = Math.round((sh - newH) / 2);
                  sh = newH;
                }
              }

              const maxDim = 1600;
              let outW = sw;
              let outH = sh;
              if (outW > maxDim || outH > maxDim) {
                if (outW >= outH) {
                  outH = Math.round((outH * maxDim) / outW);
                  outW = maxDim;
                } else {
                  outW = Math.round((outW * maxDim) / outH);
                  outH = maxDim;
                }
              }

              const canvas = document.createElement('canvas');
              canvas.width = outW;
              canvas.height = outH;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                resolve({ src: dataUrl, width: outW, height: outH });
              } else {
                resolve({ src: item.rawSrc, width: img.naturalWidth, height: img.naturalHeight });
              }
            };
            img.onerror = () => {
              resolve({ src: item.rawSrc, width: 300, height: 300 });
            };
            img.src = item.rawSrc;
          });

          const cardWidth = Math.min(300, Math.max(180, cropped.width));
          const cardHeight = Math.round(cardWidth * (cropped.height / cropped.width)) || 240;

          newCards.push({
            id: `card_${Date.now()}_${totalCreated}_${Math.random().toString(36).substr(2, 5)}`,
            x: Math.round(posX),
            y: Math.round(posY),
            width: cardWidth,
            height: cardHeight,
            src: cropped.src,
            name: item.name,
            aspectRatio: cropped.width / cropped.height,
            zIndex: maxZ + 1 + totalCreated,
          });
        } catch (err) {
          console.error('Failed to crop batch image:', err);
        }
      }

      const mergedCards = [...currentCards, ...newCards];
      handleUpdateCards(mergedCards);

      const newIds = new Set(newCards.map((c) => c.id));
      setSelectedCardIds(newIds);
      setSelectedNoteIds(new Set());

      setCanvasCropQueue([]);
      setCanvasCropIndex(0);
      setPendingCanvasCards([]);
    },
    [canvasCropQueue, canvasCropIndex, pendingCanvasCards, activeProject.cards, handleUpdateCards]
  );

  // Skip all remaining and import original uncropped images directly
  const handleSkipAllAndImportOriginals = useCallback(async () => {
    const remainingItems = canvasCropQueue.slice(canvasCropIndex);
    if (remainingItems.length === 0) return;

    const currentCards = activeProject.cards || [];
    const newCards: Card[] = [...pendingCanvasCards];
    const maxZ = currentCards.reduce((max, c) => Math.max(max, c.zIndex || 1), 1);

    for (let i = 0; i < remainingItems.length; i++) {
      const item = remainingItems[i];
      const totalCreated = newCards.length;

      const posX = item.atCanvasPos
        ? item.atCanvasPos.x + totalCreated * 35
        : 150 + totalCreated * 35;
      const posY = item.atCanvasPos
        ? item.atCanvasPos.y + totalCreated * 35
        : 150 + totalCreated * 35;

      const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth || 300, height: img.naturalHeight || 300 });
        img.onerror = () => resolve({ width: 300, height: 300 });
        img.src = item.rawSrc;
      });

      const cardWidth = Math.min(300, Math.max(180, dimensions.width));
      const cardHeight = Math.round(cardWidth * (dimensions.height / dimensions.width)) || 240;

      newCards.push({
        id: `card_${Date.now()}_${totalCreated}_${Math.random().toString(36).substr(2, 5)}`,
        x: Math.round(posX),
        y: Math.round(posY),
        width: cardWidth,
        height: cardHeight,
        src: item.rawSrc,
        name: item.name,
        aspectRatio: dimensions.width / dimensions.height,
        zIndex: maxZ + 1 + totalCreated,
      });
    }

    const mergedCards = [...currentCards, ...newCards];
    handleUpdateCards(mergedCards);

    const newIds = new Set(newCards.map((c) => c.id));
    setSelectedCardIds(newIds);
    setSelectedNoteIds(new Set());

    setCanvasCropQueue([]);
    setCanvasCropIndex(0);
    setPendingCanvasCards([]);
  }, [canvasCropQueue, canvasCropIndex, pendingCanvasCards, activeProject.cards, handleUpdateCards]);

  // Skip current photo only and advance
  const handleSkipCurrentCanvasCrop = useCallback(async () => {
    const currentItem = canvasCropQueue[canvasCropIndex];
    if (!currentItem) return;

    const currentCards = activeProject.cards || [];
    const totalCreated = pendingCanvasCards.length;

    const posX = currentItem.atCanvasPos
      ? currentItem.atCanvasPos.x + totalCreated * 35
      : 150 + totalCreated * 35;
    const posY = currentItem.atCanvasPos
      ? currentItem.atCanvasPos.y + totalCreated * 35
      : 150 + totalCreated * 35;

    const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 300, height: img.naturalHeight || 300 });
      img.onerror = () => resolve({ width: 300, height: 300 });
      img.src = currentItem.rawSrc;
    });

    const cardWidth = Math.min(300, Math.max(180, dimensions.width));
    const cardHeight = Math.round(cardWidth * (dimensions.height / dimensions.width)) || 240;
    const maxZ = currentCards.reduce((max, c) => Math.max(max, c.zIndex || 1), 1);

    const newCard: Card = {
      id: `card_${Date.now()}_${totalCreated}_${Math.random().toString(36).substr(2, 5)}`,
      x: Math.round(posX),
      y: Math.round(posY),
      width: cardWidth,
      height: cardHeight,
      src: currentItem.rawSrc,
      name: currentItem.name,
      aspectRatio: dimensions.width / dimensions.height,
      zIndex: maxZ + 1 + totalCreated,
    };

    const newPending = [...pendingCanvasCards, newCard];
    setPendingCanvasCards(newPending);

    const nextIndex = canvasCropIndex + 1;
    if (nextIndex < canvasCropQueue.length) {
      setCanvasCropIndex(nextIndex);
    } else {
      const mergedCards = [...currentCards, ...newPending];
      handleUpdateCards(mergedCards);

      const newIds = new Set(newPending.map((c) => c.id));
      setSelectedCardIds(newIds);
      setSelectedNoteIds(new Set());

      setCanvasCropQueue([]);
      setCanvasCropIndex(0);
      setPendingCanvasCards([]);
    }
  }, [canvasCropQueue, canvasCropIndex, pendingCanvasCards, activeProject.cards, handleUpdateCards]);

  // Generate Sample Reference Product Card
  const handleGenerateSample = useCallback(() => {
    const samples = [
      {
        title: 'Lumina Velvet Serum',
        category: 'Cosmetic',
        theme: { bg1: '#fff7ed', bg2: '#ffedd5', accent: '#ea580c', icon: 'sparkles' },
      },
      {
        title: 'Apex Stealth Trainer',
        category: 'Footwear',
        theme: { bg1: '#f8fafc', bg2: '#e2e8f0', accent: '#0f172a', icon: 'zap' },
      },
      {
        title: 'Aura Nectar Eau De Parfum',
        category: 'Perfume',
        theme: { bg1: '#fdf4ff', bg2: '#fae8ff', accent: '#c026d3', icon: 'sparkles' },
      },
    ];

    const pick = samples[Math.floor(Math.random() * samples.length)];
    const card = createSampleCard(
      `card_sample_${Date.now()}`,
      pick.title,
      pick.category,
      200 + Math.random() * 150,
      120 + Math.random() * 100,
      pick.theme
    );

    const merged = [...(activeProject.cards || []), card];
    handleUpdateCards(merged);
    setSelectedCardIds(new Set([card.id]));
    setSelectedNoteIds(new Set());
  }, [activeProject.cards, handleUpdateCards]);

  // Update Connections in active project
  const handleUpdateConnections = useCallback(
    (connections: Connection[]) => {
      const updated = projects.map((p) => {
        if (p.id === activeProjectId) {
          return { ...p, connections, updatedAt: Date.now() };
        }
        return p;
      });
      saveProjectsToStorage(updated);
    },
    [activeProjectId, projects, saveProjectsToStorage]
  );

  // Add connection between two cards
  const handleAddConnection = useCallback(
    (fromCardId: string, toCardId: string) => {
      if (fromCardId === toCardId) return;
      const current = activeProject.connections || [];
      const exists = current.some(
        (c) =>
          (c.from === fromCardId && c.to === toCardId) ||
          (c.from === toCardId && c.to === fromCardId)
      );
      if (exists) return;

      const newConn: Connection = {
        id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        from: fromCardId,
        to: toCardId,
      };
      handleUpdateConnections([...current, newConn]);
    },
    [activeProject.connections, handleUpdateConnections]
  );

  // Delete connection
  const handleDeleteConnection = useCallback(
    (connectionId: string) => {
      const current = activeProject.connections || [];
      handleUpdateConnections(current.filter((c) => c.id !== connectionId));
      if (selectedConnectionId === connectionId) {
        setSelectedConnectionId(null);
      }
    },
    [activeProject.connections, handleUpdateConnections, selectedConnectionId]
  );

  // Delete single card
  // Delete everything selected in one update (deleting one by one kept only the last change)
  const handleDeleteSelection = useCallback(
    (cardIds: string[], noteIds: string[]) => {
      const cardSet = new Set(cardIds);
      const noteSet = new Set(noteIds);
      const updated = projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        return {
          ...p,
          cards: (p.cards || []).filter((c) => !cardSet.has(c.id)),
          notes: (p.notes || [])
            .filter((n) => !noteSet.has(n.id))
            .map((n) => (n.attachedTo && cardSet.has(n.attachedTo) ? { ...n, attachedTo: null } : n)),
          connections: (p.connections || []).filter((c) => !cardSet.has(c.from) && !cardSet.has(c.to)),
          groups: (p.groups || [])
            .map((g) => ({ ...g, children: g.children.filter((id) => !cardSet.has(id)) }))
            .filter((g) => g.children.length > 0),
          updatedAt: Date.now(),
        };
      });
      saveProjectsToStorage(updated);
      setSelectedCardIds(new Set());
      setSelectedNoteIds(new Set());
    },
    [projects, activeProjectId, saveProjectsToStorage]
  );

  const handleDeleteCard = useCallback(
    (cardId: string) => {
      const filtered = (activeProject.cards || []).filter((c) => c.id !== cardId);
      // Also unpin any notes attached to deleted card
      const updatedNotes = (activeProject.notes || []).map((n) =>
        n.attachedTo === cardId ? { ...n, attachedTo: null } : n
      );
      // Also remove any connections tied to this card
      const updatedConnections = (activeProject.connections || []).filter(
        (c) => c.from !== cardId && c.to !== cardId
      );
      const updated = projects.map((p) => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            cards: filtered,
            notes: updatedNotes,
            connections: updatedConnections,
            updatedAt: Date.now(),
          };
        }
        return p;
      });
      saveProjectsToStorage(updated);
      setSelectedCardIds((prev) => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
    },
    [activeProject.cards, activeProject.notes, activeProject.connections, projects, activeProjectId, saveProjectsToStorage]
  );

  // Duplicate Card
  const handleDuplicateCard = useCallback(
    (card: Card) => {
      const duplicated: Card = {
        ...card,
        id: `card_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        x: card.x + 30,
        y: card.y + 30,
      };
      const updated = [...(activeProject.cards || []), duplicated];
      handleUpdateCards(updated);
      setSelectedCardIds(new Set([duplicated.id]));
      setSelectedNoteIds(new Set());
    },
    [activeProject.cards, handleUpdateCards]
  );

  // Clear All Cards and Notes
  const handleClearAll = useCallback(() => {
    const totalItems =
      (activeProject.cards?.length || 0) + (activeProject.notes?.length || 0);
    if (totalItems === 0) return;
    const confirmClear = window.confirm(
      `Очистить все элементы на канвасе проекта "${activeProject.name}"?`
    );
    if (confirmClear) {
      handleUpdateCards([]);
      handleUpdateNotes([]);
      handleUpdateConnections([]);
      setSelectedCardIds(new Set());
      setSelectedNoteIds(new Set());
      setSelectedConnectionId(null);
    }
  }, [activeProject, handleUpdateCards, handleUpdateNotes, handleUpdateConnections]);

  // Compute Considered Notes for Generation
  const consideredNotes: ConsideredNoteInfo[] = useMemo(() => {
    const currentCards = activeProject.cards || [];
    const currentNotes = activeProject.notes || [];
    const selectedCards = currentCards.filter((c) => selectedCardIds.has(c.id));

    // If no cards are selected, but notes are selected, consider selected notes directly
    if (selectedCards.length === 0) {
      return currentNotes
        .filter((n) => selectedNoteIds.has(n.id) && n.text.trim().length > 0)
        .map((n) => ({
          id: n.id,
          text: n.text.trim(),
          isAttached: Boolean(n.attachedTo),
          color: n.color,
          cardName: n.attachedTo
            ? currentCards.find((c) => c.id === n.attachedTo)?.name
            : undefined,
        }));
    }

    const attachedList: ConsideredNoteInfo[] = [];
    const nearbyList: ConsideredNoteInfo[] = [];
    const processedNoteIds = new Set<string>();

    // 1. First collect all notes ATTACHED to any of the selected cards
    currentNotes.forEach((n) => {
      if (
        n.attachedTo &&
        selectedCardIds.has(n.attachedTo) &&
        n.text.trim().length > 0
      ) {
        const card = currentCards.find((c) => c.id === n.attachedTo);
        attachedList.push({
          id: n.id,
          text: n.text.trim(),
          isAttached: true,
          color: n.color,
          cardName: card?.name || 'Карточка',
        });
        processedNoteIds.add(n.id);
      }
    });

    // 2. Then collect all UNATTACHED notes within 150px of any selected card
    currentNotes.forEach((n) => {
      if (processedNoteIds.has(n.id) || n.text.trim().length === 0) return;

      const noteRect = {
        x: n.x,
        y: n.y,
        width: n.width || 180,
        height: n.height || 140,
      };

      let isNear = false;
      for (const card of selectedCards) {
        const cardRect = {
          x: card.x,
          y: card.y,
          width: card.width,
          height: card.height || 300,
        };
        if (getDistanceBetweenRects(noteRect, cardRect) <= 150) {
          isNear = true;
          break;
        }
      }

      if (isNear) {
        nearbyList.push({
          id: n.id,
          text: n.text.trim(),
          isAttached: false,
          color: n.color,
        });
      }
    });

    // Order: attached notes first, then nearby notes
    return [...attachedList, ...nearbyList];
  }, [activeProject.cards, activeProject.notes, selectedCardIds, selectedNoteIds]);

  // Handle Site Mockup Actions
  const handleUpdateSiteMockup = useCallback(
    (mockup: SiteMockup | undefined) => {
      const updated = projects.map((p) => {
        if (p.id === activeProject.id) {
          return { ...p, siteMockup: mockup, updatedAt: Date.now() };
        }
        return p;
      });
      saveProjectsToStorage(updated);
    },
    [activeProject.id, projects, saveProjectsToStorage]
  );

  const handleDeleteSiteMockup = useCallback(() => {
    handleUpdateSiteMockup(undefined);
  }, [handleUpdateSiteMockup]);

  const handleChangeSiteMockupOpacity = useCallback(
    (opacity: number) => {
      if (!activeProject.siteMockup) return;
      handleUpdateSiteMockup({
        ...activeProject.siteMockup,
        opacity: Math.max(0.1, Math.min(1.0, opacity)),
      });
    },
    [activeProject.siteMockup, handleUpdateSiteMockup]
  );

  const handleAddSiteMockupClick = () => {
    siteMockupInputRef.current?.click();
  };

  const handleSiteMockupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const img = new Image();
      img.onload = () => {
        const currentPan = activeProject.pan || { x: 80, y: 80 };
        const currentZoom = activeProject.zoom || 1;

        const naturalW = img.naturalWidth || 1200;
        const naturalH = img.naturalHeight || 800;
        const aspect = naturalW / naturalH;
        const width = Math.min(1200, Math.max(600, naturalW));
        const height = Math.round(width / aspect);

        const initialX = Math.round((-currentPan.x + 80) / currentZoom);
        const initialY = Math.round((-currentPan.y + 80) / currentZoom);

        const newMockup: SiteMockup = {
          src: dataUrl,
          x: initialX,
          y: initialY,
          width,
          height,
          opacity: 0.5,
          scale: 1,
        };

        handleUpdateSiteMockup(newMockup);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);

    if (siteMockupInputRef.current) siteMockupInputRef.current.value = '';
  };

  // Export All Project Images to Browser Downloads
  const handleExportImages = useCallback(async () => {
    const imageCards = (activeProject.cards || []).filter((c) => Boolean(c.src));
    if (imageCards.length === 0) {
      window.alert('В проекте нет карточек с изображениями для экспорта.');
      return;
    }

    const safeProjectName = (activeProject.name || 'project')
      .toLowerCase()
      .replace(/[^a-z0-9а-яё_-]/gi, '_')
      .slice(0, 20);

    for (let i = 0; i < imageCards.length; i++) {
      const card = imageCards[i];
      const link = document.createElement('a');
      link.download = `${safeProjectName}_card_${i + 1}_${card.id.slice(-5)}.png`;
      link.href = card.src;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (i < imageCards.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }, [activeProject]);

  // Handle Gemini Image Generation
  const handleTriggerGeminiGeneration = async (
    prompt: string,
    options?: {
      isProductReplacement?: boolean;
      selectedProduct?: ProductItem;
      masterPromptName?: string;
      photoRole?: 'product' | 'style';
      /** Generate from these photos instead of the board selection (e.g. «править» on one photo) */
      sourceCards?: Card[];
    }
  ) => {
    const apiKey = getStoredApiKey();
    if (!hasGenerationAccess()) {
      setGenerationError('Укажите пароль студии или API-ключ в настройках');
      setIsSettingsOpen(true);
      return;
    }

    const currentCards = activeProject.cards || [];
    const selectedCards = options?.sourceCards || currentCards.filter((c) => selectedCardIds.has(c.id));
    const noteTexts = options?.sourceCards ? [] : consideredNotes.map((n) => n.text);

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const result = await generateImageWithGemini(
        apiKey,
        prompt,
        selectedCards,
        noteTexts,
        {
          isProductReplacement: options?.isProductReplacement,
          productImageDataUrl: options?.selectedProduct?.photoDataUrl,
          photoRole: options?.photoRole,
        }
      );

      // Compress data URL before storing
      const compressedDataUrl = await compressDataUrl(result.imageUrl, 1600, 1600, 0.9);

      // Compute position for new card (+50px to the right and down relative to references)
      let newX = 200;
      let newY = 200;

      if (selectedCards.length > 0) {
        const maxRight = Math.max(...selectedCards.map((c) => c.x + c.width));
        const minTop = Math.min(...selectedCards.map((c) => c.y));
        newX = maxRight + 50;
        newY = minTop + 50;
      } else {
        const currentPan = activeProject.pan || { x: 80, y: 80 };
        const currentZoom = activeProject.zoom || 1;
        newX = (-currentPan.x + window.innerWidth / 2 - 120) / currentZoom;
        newY = (-currentPan.y + window.innerHeight / 2 - 150) / currentZoom;
      }

      const maxZ = currentCards.reduce((max, c) => Math.max(max, c.zIndex || 1), 1);
      const cardWidth = 240;
      const cardHeight = Math.round(cardWidth * (result.height / result.width)) || 300;

      const generatedCard: Card = {
        id: `card_gen_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        x: Math.round(newX),
        y: Math.round(newY),
        width: cardWidth,
        height: cardHeight,
        src: compressedDataUrl,
        name: `Gemini_${new Date().toLocaleTimeString().replace(/:/g, '-')}.png`,
        aspectRatio: cardWidth / cardHeight,
        zIndex: maxZ + 1,
        meta: {
          kind: prompt.includes(SOURCE_FIX_MARKER) ? 'fix' : options?.isProductReplacement ? 'product' : 'generate',
          prompt,
          masterPromptName: options?.masterPromptName,
          productName: options?.isProductReplacement ? options?.selectedProduct?.name : undefined,
          model: getImageModel(),
          sourceIds: selectedCards.map((c) => c.id),
          createdAt: Date.now(),
        },
      };

      const merged = [...currentCards, generatedCard];
      // "Made from" links: every selected source card → the new card
      const autoConnections: Connection[] = selectedCards.slice(0, 5).map((c, i) => ({
        id: `conn_auto_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`,
        from: c.id,
        to: generatedCard.id,
        auto: true,
      }));
      saveProjectsToStorage(
        projects.map((p) =>
          p.id === activeProjectId
            ? {
                ...p,
                cards: merged,
                connections: [...(p.connections || []), ...autoConnections],
                updatedAt: Date.now(),
              }
            : p
        )
      );
      setSelectedCardIds(new Set([generatedCard.id]));
      setSelectedNoteIds(new Set());
      setGenerationError(null);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setGenerationError(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Batch Generation for multiple products from the library
  const handleTriggerBatchGeneration = async (
    prompt: string,
    selectedProductIds: string[],
    onProgress: (current: number, total: number, currentProductName: string) => void
  ): Promise<number> => {
    const apiKey = getStoredApiKey();
    if (!hasGenerationAccess()) {
      setGenerationError('Укажите пароль студии или API-ключ в настройках');
      setIsSettingsOpen(true);
      throw new Error('API-ключ не задан');
    }

    const currentCards = [...(activeProject.cards || [])];
    let runningCards = [...currentCards];
    let runningConnections = [...(activeProject.connections || [])];
    const selectedCards = currentCards.filter((c) => selectedCardIds.has(c.id));
    const noteTexts = consideredNotes.map((n) => n.text);

    setIsGenerating(true);
    setGenerationError(null);

    const selectedProducts = productsList.filter((p) => selectedProductIds.includes(p.id));
    let generatedCount = 0;

    try {
      for (let i = 0; i < selectedProducts.length; i++) {
        const product = selectedProducts[i];
        onProgress(i + 1, selectedProducts.length, product.name);

        const batchPrompt = `Сгенерируй новое фото продукта '${product.name}' в том же стиле, что и референсы. Сохрани форму, цвет и текстуру продукта. ${prompt || ''}`.trim();

        const result = await generateImageWithGemini(
          apiKey,
          prompt,
          selectedCards,
          noteTexts,
          {
            productImageDataUrl: product.photoDataUrl,
            customPromptOverride: batchPrompt,
          }
        );

        // Compress image data URL for localStorage safety
        const compressedDataUrl = await compressDataUrl(result.imageUrl, 1600, 1600, 0.9);

        // Find if product has matching card on canvas (by ID or matching name)
        const matchingCard = runningCards.find(
          (c) =>
            c.id === product.id ||
            (c.name && product.name && c.name.toLowerCase().includes(product.name.toLowerCase()))
        );

        let newX = 200;
        let newY = 200;

        if (matchingCard) {
          newX = matchingCard.x + 50;
          newY = matchingCard.y + 50;
        } else if (selectedCards.length > 0) {
          const maxRight = Math.max(...selectedCards.map((c) => c.x + c.width));
          const minTop = Math.min(...selectedCards.map((c) => c.y));
          newX = maxRight + 50 + (i % 3) * 260;
          newY = minTop + 50 + Math.floor(i / 3) * 320;
        } else {
          const currentPan = activeProject.pan || { x: 80, y: 80 };
          const currentZoom = activeProject.zoom || 1;
          const baseX = (-currentPan.x + window.innerWidth / 2 - 120) / currentZoom;
          const baseY = (-currentPan.y + window.innerHeight / 2 - 150) / currentZoom;
          newX = baseX + (i % 3) * 260;
          newY = baseY + Math.floor(i / 3) * 320;
        }

        const maxZ = runningCards.reduce((max, c) => Math.max(max, c.zIndex || 1), 1);
        const cardWidth = 240;
        const cardHeight = Math.round(cardWidth * (result.height / result.width)) || 300;

        const newCardId = `card_batch_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`;
        const newCard: Card = {
          id: newCardId,
          x: Math.round(newX),
          y: Math.round(newY),
          width: cardWidth,
          height: cardHeight,
          src: compressedDataUrl,
          name: `${product.name} (AI).png`,
          aspectRatio: cardWidth / cardHeight,
          zIndex: maxZ + 1 + i,
          meta: {
            kind: 'batch',
            prompt: batchPrompt,
            productName: product.name,
            model: getImageModel(),
            sourceIds: selectedCards.map((c) => c.id),
            createdAt: Date.now(),
          },
        };

        runningCards = [...runningCards, newCard];

        // Link with matching product card if on canvas
        if (matchingCard) {
          const newConn: Connection = {
            id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            from: matchingCard.id,
            to: newCardId,
            auto: true,
          };
          runningConnections = [...runningConnections, newConn];
        }

        generatedCount++;

        // Incrementally save state so user sees images appearing live on the canvas
        const updated = projects.map((p) => {
          if (p.id === activeProject.id) {
            return {
              ...p,
              cards: runningCards,
              connections: runningConnections,
              updatedAt: Date.now(),
            };
          }
          return p;
        });
        saveProjectsToStorage(updated);
      }

      // Select newly created batch cards
      const newBatchCardIds = runningCards.slice(-generatedCount).map((c) => c.id);
      setSelectedCardIds(new Set(newBatchCardIds));
      setSelectedNoteIds(new Set());
      setGenerationError(null);

      return generatedCount;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setGenerationError(errorMsg);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  };

  // Keyboard shortcut listener ('G' / 'g' / 'п' / 'П' for generation panel)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П')) {
        e.preventDefault();
        setIsGenerationOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Export JSON
  const handleExportProject = useCallback(() => {
    exportProjectToJson(activeProject, masterPrompts, productsList);
  }, [activeProject, masterPrompts, productsList]);

  // Import JSON
  const handleImportProjectClick = () => {
    jsonInputRef.current?.click();
  };

  const handleJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = (await parseProjectJson(file)) as Project & { masterPrompts?: unknown; positions?: unknown; exportedAt?: number; format?: string };
      const { masterPrompts: importedPrompts, positions: importedPositions, exportedAt: _e, format: _f, ...projectOnly } = parsed;
      const imported: Project = { ...projectOnly };
      // Importing the same file twice must not create two projects with one id
      if (projects.some((p) => p.id === imported.id)) {
        imported.id = `proj_${Date.now()}`;
        imported.name = `${imported.name} (импорт)`;
      }
      const updated = [...projects, imported];
      if (Array.isArray(importedPositions) && importedPositions.length > 0) {
        await saveProjectProducts(imported.id, importedPositions as ProductItem[]);
      }
      saveProjectsToStorage(updated);
      handleSelectProject(imported.id);
      const { merged, added } = mergeMasterPrompts(masterPrompts, importedPrompts);
      if (added > 0) handleSaveMasterPrompts(merged);
      window.alert(
        `Проект "${imported.name}" загружен.` +
          (added > 0 ? ` Добавлено мастер-промптов: ${added}.` : importedPrompts ? '' : ' В этом файле нет мастер-промптов (он сохранён старой версией).')
      );
    } catch (err) {
      window.alert('Ошибка при импорте файла проекта. Проверьте формат JSON.');
    }
    if (jsonInputRef.current) jsonInputRef.current.value = '';
  };

  // Add image button click
  const handleAddImageClick = () => {
    fileInputRef.current?.click();
  };

  // Memory Management Handlers
  const handleClearMemory = useCallback(() => {
    clearAllMemory();
  }, []);

  const handleOptimizeMemory = useCallback(async () => {
    setIsOptimizing(true);
    try {
      const res = await optimizeAllProjectsMemory();
      const loaded = loadProjects();
      setProjects(loaded);
      const usage = getStorageUsage();
      setStorageInfo(usage);
      if (usage.percentage < 80) {
        setStorageWarning(null);
      }
      if (parseFloat(res.freedMb) > 0 || res.freedBytes > 0) {
        window.alert(`Освобождено ${res.freedMb} MB (${res.optimizedCards} фото пересохранено легче)`);
      } else {
        window.alert('Все изображения уже оптимизированы (до 500px, quality 0.7). Освобождено 0.00 MB');
      }
    } catch (err) {
      console.error('Failed to optimize memory:', err);
      window.alert('Ошибка при оптимизации изображений');
    } finally {
      setIsOptimizing(false);
    }
  }, []);

  // Positions belong to the active project: load them whenever the project changes
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  useEffect(() => {
    if (!isHydrated || !activeProjectId) return;
    let alive = true;
    setProductsList([]);
    loadProjectProducts(activeProjectId, projectsRef.current).then((list) => {
      if (alive) setProductsList(list);
    });
    return () => {
      alive = false;
    };
  }, [activeProjectId, isHydrated]);

  // Save positions of the active project
  const handleSaveProducts = useCallback(
    (newProducts: ProductItem[]) => {
      undo.record({ kind: 'products', scope: activeProjectId, state: latestProductsRef.current });
      setProductsList(newProducts);
      saveProjectProducts(activeProjectId, newProducts);
    },
    [activeProjectId, undo]
  );

  // «перенести в проект…»: the ticked positions leave this project and join another one
  const handleMoveProductsToProject = useCallback(
    async (ids: string[], targetProjectId: string) => {
      if (!targetProjectId || targetProjectId === activeProjectId) return;
      const moving = productsList.filter((p) => ids.includes(p.id));
      await appendProductsToProject(targetProjectId, moving, projects);
      handleSaveProducts(productsList.filter((p) => !ids.includes(p.id)));
    },
    [activeProjectId, productsList, projects, handleSaveProducts]
  );

  // Add product photo from library to canvas
  const handleAddProductToCanvas = useCallback(
    async (product: ProductItem) => {
      if (!product.photoDataUrl) return;
      const currentCards = activeProject.cards || [];
      const startX = activeProject.pan ? -activeProject.pan.x / (activeProject.zoom || 1) + 200 : 200;
      const startY = activeProject.pan ? -activeProject.pan.y / (activeProject.zoom || 1) + 150 : 150;

      const newCard: Card = {
        id: `card_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: product.name || 'Товар',
        src: product.photoDataUrl,
        x: Math.round(startX + (currentCards.length % 5) * 40),
        y: Math.round(startY + (currentCards.length % 5) * 40),
        width: 220,
        height: 220,
      };

      const updatedCards = [...currentCards, newCard];
      const updatedProjects = projects.map((p) =>
        p.id === activeProject.id ? { ...p, cards: updatedCards, updatedAt: Date.now() } : p
      );
      saveProjectsToStorage(updatedProjects);
      setSelectedCardIds(new Set([newCard.id]));
    },
    [activeProject, projects, saveProjectsToStorage]
  );

  // Grouping handlers
  const handleGroupSelected = useCallback(() => {
    const selectedCards = (activeProject.cards || []).filter((c) => selectedCardIds.has(c.id));
    if (selectedCards.length === 0) {
      window.alert('Выберите хотя бы одну карточку для группировки');
      return;
    }

    const existingGroups = activeProject.groups || [];
    const newGroupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const groupColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    const color = groupColors[existingGroups.length % groupColors.length];

    const selectedIds: string[] = Array.from(selectedCardIds);

    // Remove these cards from any existing groups first
    const cleanedGroups = existingGroups
      .map((g) => ({
        ...g,
        children: g.children.filter((cid) => !selectedCardIds.has(cid)),
      }))
      .filter((g) => g.children.length > 0);

    const newGroup: CardGroup = {
      id: newGroupId,
      type: 'group',
      name: `Группа ${existingGroups.length + 1}`,
      children: selectedIds,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      color,
    };

    const updatedProjects = projects.map((p) =>
      p.id === activeProject.id
        ? { ...p, groups: [...cleanedGroups, newGroup], updatedAt: Date.now() }
        : p
    );
    saveProjectsToStorage(updatedProjects);
  }, [activeProject, selectedCardIds, projects, saveProjectsToStorage]);

  const handleUngroup = useCallback(
    (groupId: string) => {
      const updatedGroups = (activeProject.groups || []).filter((g) => g.id !== groupId);
      const updatedProjects = projects.map((p) =>
        p.id === activeProject.id
          ? { ...p, groups: updatedGroups, updatedAt: Date.now() }
          : p
      );
      saveProjectsToStorage(updatedProjects);
    },
    [activeProject, projects, saveProjectsToStorage]
  );

  const handleRenameGroup = useCallback(
    (groupId: string, name: string) => {
      const clean = name.trim();
      if (!clean) return;
      saveProjectsToStorage(
        projects.map((p) =>
          p.id === activeProject.id
            ? { ...p, groups: (p.groups || []).map((g) => (g.id === groupId ? { ...g, name: clean } : g)), updatedAt: Date.now() }
            : p
        )
      );
    },
    [activeProject, projects, saveProjectsToStorage]
  );

  // ---- Board → positions / catalog ----
  /** Left to right, row by row, the way the photos are laid out */
  const readingOrder = (cards: Card[]) =>
    [...cards].sort((a, b) => Math.round(a.y / 160) - Math.round(b.y / 160) || a.x - b.x);
  const groupOfCard = (cardId: string) => (activeProject.groups || []).find((g) => g.children.includes(cardId));

  /** 'each': one position per photo. 'one': one position, first photo = original, the rest = angles */
  const handleCardsToPositions = useCallback(
    async (cardIds: string[], mode: 'each' | 'one', name?: string) => {
      const cards = readingOrder((activeProject.cards || []).filter((c) => cardIds.includes(c.id) && c.src));
      if (cards.length === 0) return;
      const photos = await Promise.all(cards.map((c) => compressImageDataUrl(c.src, 1200, 0.85)));
      const id = (n: number) => `prod_${Date.now()}_${n}_${Math.random().toString(36).slice(2, 6)}`;
      let fresh: ProductItem[];
      if (mode === 'one') {
        const g = groupOfCard(cards[0].id);
        fresh = [
          {
            id: id(0),
            name: name || g?.name || cards[0].name || 'Товар',
            photoDataUrl: photos[0],
            variants: photos.slice(1),
          },
        ];
        if (photos.length > 1) ensureVariantCols(photos.length - 1);
      } else {
        fresh = cards.map((c, i) => ({ id: id(i), name: c.name || `Фото ${i + 1}`, photoDataUrl: photos[i], category: groupOfCard(c.id)?.name }));
      }
      handleSaveProducts([...latestProductsRef.current, ...fresh]);
      setIsProductLibraryOpen(true);
      setFolderImportStatus(
        mode === 'one' ? `В позиции: «${fresh[0].name}», фото ${photos.length} (первое — исходник, остальные — ракурсы).` : `В позиции добавлено ${fresh.length}.`
      );
      setTimeout(() => setFolderImportStatus(null), 6000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProject, handleSaveProducts]
  );

  // ---- «Оси»: grids on the board ----
  const patchActive = useCallback(
    (fn: (p: Project) => Project) => {
      saveProjectsToStorage(latestProjectsRef.current.map((p) => (p.id === activeProjectId ? { ...fn(p), updatedAt: Date.now() } : p)));
    },
    [activeProjectId, saveProjectsToStorage]
  );
  const withMatrix = useCallback(
    (id: string, fn: (m: BoardMatrix, cards: Card[]) => { matrix: BoardMatrix | null; cards?: Card[] }) =>
      patchActive((p) => {
        const m = (p.matrices || []).find((x) => x.id === id);
        if (!m) return p;
        const r = fn(m, p.cards || []);
        const matrices = r.matrix ? (p.matrices || []).map((x) => (x.id === id ? r.matrix! : x)) : (p.matrices || []).filter((x) => x.id !== id);
        return { ...p, matrices, cards: r.cards || p.cards };
      }),
    [patchActive]
  );
  const matrixDragRef = useRef<{ id: string; m: BoardMatrix; cards: Map<string, { x: number; y: number }> } | null>(null);
  const handleMatrixToPositions = useCallback(
    (id: string) => {
      const p = latestProjectsRef.current.find((x) => x.id === activeProjectId);
      const m = p?.matrices?.find((x) => x.id === id);
      if (!p || !m) return;
      const drafts = matrixToPositionDrafts(m, p.cards || []);
      if (drafts.length === 0) return;
      (async () => {
        const fresh: ProductItem[] = [];
        let n = 0;
        for (const d of drafts) {
          const photo = await compressImageDataUrl(d.photoDataUrl, 1200, 0.85);
          const variants = await Promise.all((d.variants || []).map((v) => (v ? compressImageDataUrl(v, 1200, 0.85) : Promise.resolve(null))));
          fresh.push({ ...d, id: `prod_${Date.now()}_${n++}_${Math.random().toString(36).slice(2, 6)}`, photoDataUrl: photo, variants, category: m.name && m.name !== 'Оси' ? m.name : undefined });
        }
        const maxVariants = Math.max(0, ...fresh.map((f) => f.variants?.length || 0));
        if (maxVariants) ensureVariantCols(maxVariants);
        handleSaveProducts([...latestProductsRef.current, ...fresh]);
        setIsProductLibraryOpen(true);
        setFolderImportStatus(`Из осей в позиции: ${fresh.length}. Ракурсы легли в колонки по порядку.`);
        setTimeout(() => setFolderImportStatus(null), 6000);
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProjectId, handleSaveProducts]
  );
  const matrixApi: MatrixApi = useMemo(
    () => ({
      update: (m) => withMatrix(m.id, () => ({ matrix: m })),
      remove: (id) => withMatrix(id, () => ({ matrix: null })),
      transpose: (id) => withMatrix(id, (m, cards) => transposeMatrix(m, cards)),
      toPositions: handleMatrixToPositions,
      addLine: (id, axis) => withMatrix(id, (m) => ({ matrix: addLine(m, axis) })),
      removeLine: (id, axis, idx) => withMatrix(id, (m, cards) => removeLine(m, axis, idx, cards)),
      drag: (id, dx, dy, phase) => {
        const p = latestProjectsRef.current.find((x) => x.id === activeProjectId);
        if (phase === 'start') {
          const m = p?.matrices?.find((x) => x.id === id);
          if (!m || !p) return;
          const members = membersOf(m, p.cards || []);
          matrixDragRef.current = { id, m, cards: new Map((p.cards || []).filter((c) => members.has(c.id)).map((c) => [c.id, { x: c.x, y: c.y }])) };
          return;
        }
        const start = matrixDragRef.current;
        if (!start || start.id !== id) return;
        withMatrix(id, (_m, cards) => ({
          matrix: { ...start.m, x: Math.round(start.m.x + dx), y: Math.round(start.m.y + dy) },
          cards: cards.map((c) => {
            const o = start.cards.get(c.id);
            return o ? { ...c, x: Math.round(o.x + dx), y: Math.round(o.y + dy) } : c;
          }),
        }));
        if (phase === 'end') matrixDragRef.current = null;
      },
    }),
    [withMatrix, handleMatrixToPositions, activeProjectId]
  );
  const handleAddMatrix = useCallback(
    (at: { x: number; y: number }) =>
      patchActive((p) => ({ ...p, matrices: [...(p.matrices || []), newMatrix(Math.round(at.x + MATRIX_LABEL_W), Math.round(at.y + MATRIX_LABEL_H + 30))] })),
    [patchActive]
  );
  /** Selected photos → a grid: each group (or each loose photo) becomes a product line */
  const handleCardsToMatrix = useCallback(
    (cardIds: string[]) =>
      patchActive((p) => {
        const sel = readingOrder((p.cards || []).filter((c) => cardIds.includes(c.id)));
        if (sel.length === 0) return p;
        const lines: { name: string; cards: Card[] }[] = [];
        const byGroup = new Map<string, { name: string; cards: Card[] }>();
        sel.forEach((c) => {
          const g = (p.groups || []).find((x) => x.children.includes(c.id));
          if (g) {
            if (!byGroup.has(g.id)) {
              const line = { name: g.name || 'Товар', cards: [] as Card[] };
              byGroup.set(g.id, line);
              lines.push(line);
            }
            byGroup.get(g.id)!.cards.push(c);
          } else lines.push({ name: c.name || `Товар ${lines.length + 1}`, cards: [c] });
        });
        const minX = Math.min(...sel.map((c) => c.x));
        const maxY = Math.max(...(p.cards || []).map((c) => c.y + (c.height || 300)));
        const { matrix, cards } = matrixFromGroups(Math.round(minX + 200), Math.round(maxY + 160), lines);
        const placed = new Map(cards.map((c) => [c.id, c]));
        // A group that went into the grid whole is now a product line: the line keeps its name, the frame goes
        const groups = (p.groups || []).filter((g) => !g.children.every((id) => placed.has(id)));
        // Bring the grid into view: its top-left corner near the top-left of the screen
        const zoom = p.zoom || 1;
        const pan = { x: Math.round(40 + MATRIX_LABEL_W * zoom - matrix.x * zoom), y: Math.round(70 + MATRIX_LABEL_H * zoom - matrix.y * zoom) };
        return { ...p, groups, pan, matrices: [...(p.matrices || []), matrix], cards: (p.cards || []).map((c) => placed.get(c.id) || c) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchActive]
  );
  /** Photos let go over a grid snap into its cells */
  const handleCardsDragEnd = useCallback(
    (ids: string[]) => {
      setTimeout(() => {
        const p = latestProjectsRef.current.find((x) => x.id === activeProjectId);
        if (!p?.matrices?.length) return;
        let cards = p.cards || [];
        let changed = false;
        const matrices = p.matrices.map((m) => {
          const moved = cards.filter((c) => ids.includes(c.id) && isOverMatrix(m, c)).map((c) => c.id);
          if (moved.length === 0) return m;
          changed = true;
          const r = snapIntoMatrix(m, cards, moved);
          cards = r.cards;
          return r.matrix;
        });
        if (changed) patchActive((x) => ({ ...x, matrices, cards }));
      }, 40);
    },
    [activeProjectId, patchActive]
  );

  const [catalogIncoming, setCatalogIncoming] = useState<{ key: number; items: { name: string; src: string }[] } | null>(null);
  const handleCardsToCatalog = useCallback(
    (cardIds: string[]) => {
      const cards = readingOrder((activeProject.cards || []).filter((c) => cardIds.includes(c.id) && c.src));
      if (cards.length === 0) return;
      setCatalogIncoming({ key: Date.now(), items: cards.map((c) => ({ name: c.name || 'фото', src: c.src })) });
      setStudioView('catalog');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProject, setStudioView]
  );

  // Style Analysis Handlers (gemini-2.5-flash)
  const handleAnalyzeStyle = useCallback(async () => {
    const apiKey = getStoredApiKey();
    if (!hasGenerationAccess()) {
      setIsSettingsOpen(true);
      return;
    }

    const selectedCards = (activeProject.cards || []).filter((c) => selectedCardIds.has(c.id));
    if (selectedCards.length === 0) {
      window.alert('Пожалуйста, выделите от 1 до 5 карточек-изображений на канвасе для анализа стиля.');
      return;
    }

    const cardsToAnalyze = selectedCards.slice(0, 5);
    setIsStyleAnalysisOpen(true);
    setIsAnalyzingStyle(true);
    setStyleAnalysisTags('');

    try {
      const tags = await analyzeStyleWithGemini(apiKey, cardsToAnalyze);
      setStyleAnalysisTags(tags);

      // Keep the result on the board as a note next to the analysed photos, so it doesn't vanish with the window
      const maxRight = Math.max(...cardsToAnalyze.map((c) => c.x + c.width));
      const minTop = Math.min(...cardsToAnalyze.map((c) => c.y));
      const styleNote: Note = {
        id: `note_style_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        x: Math.round(maxRight + 24),
        y: Math.round(minTop),
        width: 220,
        height: 160,
        text: `Стиль (${cardsToAnalyze.length} фото): ${tags}`,
        color: 'blue',
        attachedTo: null,
        projectId: activeProject.id,
        zIndex: 20,
      };
      handleUpdateNotes([...(activeProject.notes || []), styleNote]);
    } catch (err: any) {
      console.error('Style analysis error:', err);
      setStyleAnalysisTags(`Ошибка: ${err?.message || 'Не удалось проанализировать стиль'}`);
    } finally {
      setIsAnalyzingStyle(false);
    }
  }, [activeProject, selectedCardIds, handleUpdateNotes]);

  const handleSaveStyleAsMasterPrompt = useCallback(
    (tagsText: string) => {
      const newPrompt: MasterPrompt = {
        id: `mp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: `Стиль из ${selectedCardIds.size || 1} референсов`,
        prompt: tagsText,
        tags: ['Стиль', 'Анализ'],
        category: 'Мои',
        projectId: activeProject.id,
        createdAt: Date.now(),
      };
      const updated = [newPrompt, ...masterPrompts];
      handleSaveMasterPrompts(updated);
    },
    [selectedCardIds, masterPrompts, handleSaveMasterPrompts, activeProject.id]
  );

  const handleUseStyleInGeneration = useCallback((tagsText: string) => {
    setCurrentPromptPreset(tagsText);
    setIsGenerationOpen(true);
    setIsStyleAnalysisOpen(false);
  }, []);

  // Board photos dropped on a position: into the given slot, or the first free one (original first, then variants)
  const handleDropCardsOnPosition = useCallback(
    (cardIds: string[], positionId: string, slot?: number) => {
      const srcs = cardIds
        .map((id) => (activeProject.cards || []).find((c) => c.id === id)?.src)
        .filter((src): src is string => Boolean(src));
      if (srcs.length === 0) return;
      const next = productsList.map((p) => {
        if (p.id !== positionId) return p;
        let photo = p.photoDataUrl;
        const variants = [...(p.variants || [])];
        const queue = [...srcs];
        if (slot === -1) photo = queue.shift() || photo;
        else if (slot !== undefined && slot >= 0) {
          variants[slot] = queue.shift() || variants[slot];
        } else if (!photo) photo = queue.shift() || photo;
        // The rest fill free variant columns, then new ones
        for (const src of queue) {
          const free = variants.findIndex((v) => !v);
          if (free >= 0) variants[free] = src;
          else variants.push(src);
        }
        return { ...p, photoDataUrl: photo, variants };
      });
      handleSaveProducts(next);
    },
    [activeProject.cards, productsList, handleSaveProducts]
  );

  // What to take from a reference photo (фон, свет, ракурс…)
  const handleChangeCardTakes = useCallback(
    (cardId: string, takes: string[]) => {
      handleUpdateCards((activeProject.cards || []).map((c) => (c.id === cardId ? { ...c, takes } : c)));
    },
    [activeProject.cards, handleUpdateCards]
  );

  // «править» on one photo: edit it by words (or by a «Исходник» prompt); the result appears next to it
  const handleEditCard = useCallback(
    (cardId: string, instruction: string, promptName?: string) => {
      const card = (activeProject.cards || []).find((c) => c.id === cardId);
      const text = instruction.trim();
      if (!card || !text) return;
      const prompt = text.includes(SOURCE_FIX_MARKER) ? text : `${SOURCE_FIX_MARKER} ${text}`;
      handleTriggerGeminiGeneration(prompt, { sourceCards: [card], masterPromptName: promptName });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProject.cards, projects, activeProjectId]
  );
  const quickEditPrompts = useMemo(() => masterPrompts.filter((mp) => mp.prompt.includes(SOURCE_FIX_MARKER)), [masterPrompts]);

  // The selection is exactly one existing group → the top-bar cell ungroups it
  const selectedGroup = useMemo(() => {
    if (selectedCardIds.size === 0) return undefined;
    return (activeProject.groups || []).find(
      (g) => g.children.length === selectedCardIds.size && g.children.every((id) => selectedCardIds.has(id))
    );
  }, [activeProject.groups, selectedCardIds]);

  // ⌘G groups the selection, ⇧⌘G ungroups the group it belongs to
  const groupKeysRef = useRef({ group: handleGroupSelected, ungroup: handleUngroup, groups: activeProject.groups, sel: selectedCardIds });
  groupKeysRef.current = { group: handleGroupSelected, ungroup: handleUngroup, groups: activeProject.groups, sel: selectedCardIds };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'g') return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      const { group, ungroup, groups, sel } = groupKeysRef.current;
      if (sel.size === 0) return;
      e.preventDefault();
      if (e.shiftKey) {
        const g = (groups || []).find((x) => x.children.some((id) => sel.has(id)));
        if (g) ungroup(g.id);
      } else {
        group();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ⌘A selects every photo on the board (only on the board, not while typing or inside a panel)
  const selectAllRef = useRef({ view: studioView, cards: activeProject.cards });
  selectAllRef.current = { view: studioView, cards: activeProject.cards };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'a' || e.shiftKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      if (t.closest && t.closest('#studio-dock, #catalog-studio, [role="dialog"]')) return;
      const { view, cards } = selectAllRef.current;
      if (view !== 'board' || !cards?.length) return;
      e.preventDefault();
      setSelectedCardIds(new Set(cards.map((c) => c.id)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ⌘Z / Ctrl+Z steps back, ⇧⌘Z or ⌘Y forward. Text fields keep their own undo.
  const undoStateRef = useRef({ activeProjectId, handleSaveProducts });
  undoStateRef.current = { activeProjectId, handleSaveProducts };
  const stepHistory = useCallback(
    (direction: 'undo' | 'redo') =>
      undo.step(direction, (entry) => {
        if (entry.kind === 'board') {
          const current = latestProjectsRef.current;
          // The view (pan, zoom) is not part of history: keep where the user is looking now
          const restored = (entry.state as Project[]).map((p) => {
            const now = current.find((x) => x.id === p.id);
            return now ? { ...p, pan: now.pan, zoom: now.zoom } : p;
          });
          setProjects(restored);
          saveProjects(restored);
          setSelectedCardIds(new Set());
          setSelectedNoteIds(new Set());
          return current;
        }
        if (entry.kind === 'products') {
          const list = entry.state as ProductItem[];
          if (entry.scope === undoStateRef.current.activeProjectId) {
            const current = latestProductsRef.current;
            setProductsList(list);
            saveProjectProducts(entry.scope, list);
            return current;
          }
          if (entry.scope) saveProjectProducts(entry.scope, list);
          return undefined;
        }
        return undefined;
      }),
    [undo]
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      const isUndo = (key === 'z' || key === 'я') && !e.shiftKey;
      const isRedo = ((key === 'z' || key === 'я') && e.shiftKey) || key === 'y' || key === 'н';
      if (!isUndo && !isRedo) return;
      const t = e.target as HTMLElement;
      if ((t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox') || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      e.preventDefault();
      stepHistory(isUndo ? 'undo' : 'redo');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepHistory]);

  // ---- Copy / cut / paste of board photos and notes ----
  // The studio keeps its own copy (names, roles, attached notes); the system clipboard gets the first photo
  // as a picture for other apps, plus a marker so a paste back here uses the full copy.
  const boardClipRef = useRef<{ id: string; cards: Card[]; notes: Note[]; pastes: number } | null>(null);
  const clipStateRef = useRef({ activeProject, selectedCardIds, selectedNoteIds, handleDeleteSelection, handleUpdateCards, saveProjectsToStorage, projects, activeProjectId });
  clipStateRef.current = { activeProject, selectedCardIds, selectedNoteIds, handleDeleteSelection, handleUpdateCards, saveProjectsToStorage, projects, activeProjectId };

  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return Boolean(el && ((el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox') || el.tagName === 'TEXTAREA' || el.isContentEditable));
    };
    const overPanel = () => Boolean(document.querySelector('#studio-dock:hover, #catalog-studio'));
    const onCopyOrCut = (e: ClipboardEvent) => {
      if (isTyping(e.target) || overPanel()) return;
      const { activeProject: proj, selectedCardIds: sc, selectedNoteIds: sn, handleDeleteSelection: del } = clipStateRef.current;
      const cards = (proj.cards || []).filter((c) => sc.has(c.id));
      const notes = (proj.notes || []).filter((n) => sn.has(n.id) || (n.attachedTo && sc.has(n.attachedTo)));
      if (cards.length === 0 && notes.length === 0) return;
      e.preventDefault();
      const id = Math.random().toString(36).slice(2, 10);
      boardClipRef.current = { id, cards, notes, pastes: 0 };
      e.clipboardData?.setData('text/plain', `aips-clip:${id}`);
      if (cards[0]) copyPictureToSystem(cards[0].src, `aips-clip:${id}`);
      if (e.type === 'cut') del(cards.map((c) => c.id), notes.map((n) => n.id));
    };
    document.addEventListener('copy', onCopyOrCut);
    document.addEventListener('cut', onCopyOrCut);
    return () => {
      document.removeEventListener('copy', onCopyOrCut);
      document.removeEventListener('cut', onCopyOrCut);
    };
  }, []);

  /** Paste the studio's own copy: new ids, shifted a bit each time, attached notes follow their photo */
  const pasteBoardClip = useCallback(() => {
    const clip = boardClipRef.current;
    if (!clip) return false;
    const { projects: list, activeProjectId: pid, saveProjectsToStorage: save } = clipStateRef.current;
    clip.pastes += 1;
    const shift = 40 * clip.pastes;
    const stamp = Date.now();
    const idMap = new Map<string, string>();
    const proj = list.find((p) => p.id === pid);
    if (!proj) return false;
    const topZ = (proj.cards || []).reduce((m, c) => Math.max(m, c.zIndex || 1), 1);
    const newCards = clip.cards.map((c, i) => {
      const nid = `card_${stamp}_${i}_${Math.random().toString(36).slice(2, 6)}`;
      idMap.set(c.id, nid);
      return { ...c, id: nid, x: c.x + shift, y: c.y + shift, zIndex: topZ + 1 + i };
    });
    const newNotes = clip.notes.map((n, i) => ({
      ...n,
      id: `note_${stamp}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      x: n.x + shift,
      y: n.y + shift,
      attachedTo: n.attachedTo ? idMap.get(n.attachedTo) || null : null,
    }));
    save(
      list.map((p) =>
        p.id === pid ? { ...p, cards: [...(p.cards || []), ...newCards], notes: [...(p.notes || []), ...newNotes], updatedAt: Date.now() } : p
      )
    );
    setSelectedCardIds(new Set(newCards.map((c) => c.id)));
    setSelectedNoteIds(new Set(newNotes.map((n) => n.id)));
    return true;
  }, []);

  // Paste: a picture copied anywhere (Pinterest "Copy image", a screenshot) lands on the board with ⌘V / Ctrl+V
  const handleAddImagesRef = useRef(handleAddImages);
  handleAddImagesRef.current = handleAddImages;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      // Over the positions panel, the panel handles paste itself
      if (document.querySelector('#drawer-products-panel:hover, #catalog-studio')) return;
      const marker = e.clipboardData?.getData('text/plain') || '';
      if (boardClipRef.current && marker === `aips-clip:${boardClipRef.current.id}`) {
        e.preventDefault();
        pasteBoardClip();
        return;
      }
      const items = Array.from(e.clipboardData?.items || []);
      const stamp = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const files = items
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it, i) => {
          const f = it.getAsFile();
          if (!f) return null;
          const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          return new File([f], `Вставка ${stamp}${i ? ` ${i + 1}` : ''}.${ext}`, { type: f.type });
        })
        .filter((f): f is File => f !== null);
      if (files.length === 0) return;
      e.preventDefault();
      handleAddImagesRef.current(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pasteBoardClip]);

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      await handleAddImages(files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const selectedCardsList = (activeProject.cards || []).filter((c) =>
    selectedCardIds.has(c.id)
  );

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
                'Таблица товаров («Продукты»): из неё делается каталог и экспорт для сайта. Если такая позиция уже есть (по коду или названию), фото добавится к ней.',
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
              {choice('И туда, и туда', 'Позиции заполнятся, а на доске появятся те же фото группами — разбирать и сравнивать.', async () => {
                const { files, pos } = pendingFolder;
                setPendingFolder(null);
                await handleImportFolderAsProducts(files);
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
      />

      {/* Main Workspace: Sidebar + Infinite Canvas */}
      <div className="flex flex-1 h-[calc(100vh-56px)] overflow-hidden relative">
        <Sidebar
          projects={projects}
          activeProjectId={activeProjectId}
          storageInfo={storageInfo}
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
        <Canvas
          project={activeProject}
          onAddFolder={askAboutFolder}
          onDeleteSelection={handleDeleteSelection}
          onDropProducts={handleDropProducts}
          onChangeCardTakes={handleChangeCardTakes}
          onEditCard={handleEditCard}
          quickEditPrompts={quickEditPrompts}
          isGenerating={isGenerating}
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
        />

        {studioView === 'catalog' && (
          <CatalogStudio
            isOpen={true}
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
                  onGenerateBatch={handleTriggerBatchGeneration}
                  isGenerating={isGenerating}
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
      />

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
