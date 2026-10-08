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
  clearAllMemory,
  optimizeAllProjectsMemory,
  loadMasterPrompts,
  loadMasterPromptsAsync,
  saveMasterPrompts,
} from './utils/storage';
import { compressAndLoadImage, compressDataUrl, createSampleCard } from './utils/imageUtils';
import { getStoredApiKey, hasGenerationAccess, generateImageWithGemini, analyzeStyleWithGemini } from './utils/gemini';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ExportModal } from './components/ExportModal';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { SettingsModal } from './components/SettingsModal';
import { GenerationPanel, ConsideredNoteInfo } from './components/GenerationPanel';
import { MasterPromptsModal } from './components/MasterPromptsModal';
import { StyleAnalysisModal } from './components/StyleAnalysisModal';
import { ProductLibraryDrawer, loadGlobalProducts, saveGlobalProducts } from './components/ProductLibraryDrawer';
import { ImageCropModal, CropAspectRatio } from './components/ImageCropModal';
import { RightDrawer } from './components/RightDrawer';
import { CatalogStudio } from './components/CatalogStudio';

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
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  // Hidden file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const siteMockupInputRef = useRef<HTMLInputElement>(null);

  // Initial Data Load with IndexedDB hydration & auto-migration
  useEffect(() => {
    // 1. Fast sync initial state
    const fastProjects = loadProjects();
    setProjects(fastProjects);
    const activeId = getActiveProjectId(fastProjects);
    setActiveProjectIdState(activeId);
    setMasterPrompts(loadMasterPrompts());
    setProductsList(loadGlobalProducts());
    setStorageInfo(getStorageUsage());

    // 2. Full IndexedDB async hydration
    let isMounted = true;
    (async () => {
      try {
        const [asyncProjects, asyncPrompts, asyncProducts, asyncStorage] = await Promise.all([
          loadProjectsAsync(),
          loadMasterPromptsAsync(),
          loadGlobalProducts(),
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
          if (asyncProducts) {
            setProductsList(asyncProducts);
          }
          if (asyncStorage) {
            setStorageInfo(asyncStorage);
          }
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
  const handleToggleConnectionMode = useCallback(() => {
    setIsConnectionMode((prev) => {
      if (prev) {
        setConnectingSourceCardId(null);
        setSelectedConnectionId(null);
      }
      return !prev;
    });
  }, []);

  // Sync to IndexedDB Storage
  const saveProjectsToStorage = useCallback((updatedProjects: Project[]) => {
    setProjects(updatedProjects);
    saveProjects(updatedProjects);
    // Asynchronously refresh accurate storage usage
    getStorageUsageAsync().then((usage) => {
      if (usage) setStorageInfo(usage);
    }).catch(() => {
      setStorageInfo(getStorageUsage());
    });
  }, []);

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
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id === activeProjectId) {
            return { ...p, pan, zoom };
          }
          return p;
        })
      );
      const updated = projects.map((p) =>
        p.id === activeProjectId ? { ...p, pan, zoom } : p
      );
      saveProjects(updated);
    },
    [activeProjectId, projects]
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

      const imageFiles = files.filter(
        (f) => f.type.startsWith('image/') || f.name.match(/\.(png|jpe?g|webp|gif|svg)$/i)
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
              let targetRatio: number | null = null;
              if (aspectRatio === '1:1') targetRatio = 1.0;
              else if (aspectRatio === '4:3') targetRatio = 4 / 3;
              else if (aspectRatio === '16:9') targetRatio = 16 / 9;

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

              const maxDim = 800;
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
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
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
    options?: { isProductReplacement?: boolean; selectedProduct?: ProductItem }
  ) => {
    const apiKey = getStoredApiKey();
    if (!hasGenerationAccess()) {
      setGenerationError('Укажите пароль студии или API-ключ в настройках');
      setIsSettingsOpen(true);
      return;
    }

    const currentCards = activeProject.cards || [];
    const selectedCards = currentCards.filter((c) => selectedCardIds.has(c.id));
    const noteTexts = consideredNotes.map((n) => n.text);

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
        }
      );

      // Compress data URL before storing
      const compressedDataUrl = await compressDataUrl(result.imageUrl, 800, 800, 0.85);

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
      };

      const merged = [...currentCards, generatedCard];
      handleUpdateCards(merged);
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
        const compressedDataUrl = await compressDataUrl(result.imageUrl, 800, 800, 0.82);

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
        };

        runningCards = [...runningCards, newCard];

        // Link with matching product card if on canvas
        if (matchingCard) {
          const newConn: Connection = {
            id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            from: matchingCard.id,
            to: newCardId,
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

      if (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') {
        e.preventDefault();
        setIsGenerationOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Export JSON
  const handleExportProject = useCallback(() => {
    exportProjectToJson(activeProject);
  }, [activeProject]);

  // Import JSON
  const handleImportProjectClick = () => {
    jsonInputRef.current?.click();
  };

  const handleJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await parseProjectJson(file);
      const updated = [...projects, imported];
      saveProjectsToStorage(updated);
      handleSelectProject(imported.id);
      window.alert(`Проект "${imported.name}" успешно загружен!`);
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
        window.alert(`Освобождено ${res.freedMb} MB (${res.optimizedCards} изображений сжато до 500px)`);
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

  // Save Products
  const handleSaveProducts = useCallback((newProducts: ProductItem[]) => {
    setProductsList(newProducts);
    saveGlobalProducts(newProducts);
  }, []);

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
    } catch (err: any) {
      console.error('Style analysis error:', err);
      setStyleAnalysisTags(`Ошибка: ${err?.message || 'Не удалось проанализировать стиль'}`);
    } finally {
      setIsAnalyzingStyle(false);
    }
  }, [activeProject, selectedCardIds]);

  const handleSaveStyleAsMasterPrompt = useCallback(
    (tagsText: string) => {
      const newPrompt: MasterPrompt = {
        id: `mp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: `Стиль из ${selectedCardIds.size || 1} референсов`,
        prompt: tagsText,
        tags: ['Стиль', 'Анализ'],
        createdAt: Date.now(),
      };
      const updated = [newPrompt, ...masterPrompts];
      handleSaveMasterPrompts(updated);
    },
    [selectedCardIds, masterPrompts, handleSaveMasterPrompts]
  );

  const handleUseStyleInGeneration = useCallback((tagsText: string) => {
    setCurrentPromptPreset(tagsText);
    setIsGenerationOpen(true);
    setIsStyleAnalysisOpen(false);
  }, []);

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
      className="flex flex-col w-screen h-screen overflow-hidden bg-[#f3f4f6] text-[#1f2937] font-sans relative"
    >
      {/* Storage Warning Banner (>80%) */}
      {storageWarning && (
        <div
          id="storage-warning-banner"
          className="bg-amber-500 text-white text-xs px-4 py-2 flex items-center justify-between shadow-md z-40 animate-fade-in"
        >
          <div className="flex items-center gap-2 font-medium">
            <span>⚠️ {storageWarning}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOptimizeMemory}
              disabled={isOptimizing}
              className="bg-white text-amber-700 font-semibold px-2.5 py-1 rounded text-xs hover:bg-amber-50 transition-colors shadow-xs"
            >
              {isOptimizing ? 'Сжатие...' : 'Оптимизировать память'}
            </button>
            <button
              onClick={() => setStorageWarning(null)}
              className="text-white hover:text-amber-100 p-1 text-xs opacity-80 hover:opacity-100"
              title="Закрыть"
            >
              ✕
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
        onToggleSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        onAddImage={handleAddImageClick}
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
        onAddSiteMockup={handleAddSiteMockupClick}
        hasSiteMockup={Boolean(activeProject.siteMockup)}
        onExportImages={handleExportImages}
        onOpenRightDrawer={() => setIsRightDrawerOpen(true)}
        onOpenCatalog={() => setIsCatalogOpen(true)}
      />

      {/* Main Workspace: Sidebar + Infinite Canvas */}
      <div className="flex flex-1 h-[calc(100vh-56px)] overflow-hidden relative">
        <Sidebar
          projects={projects}
          activeProjectId={activeProjectId}
          storageInfo={storageInfo}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
        />

        <Canvas
          project={activeProject}
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
          onAnalyzeStyle={handleAnalyzeStyle}
          onUpdateSiteMockup={handleUpdateSiteMockup}
          onDeleteSiteMockup={handleDeleteSiteMockup}
          onChangeSiteMockupOpacity={handleChangeSiteMockupOpacity}
        />
      </div>

      {/* Generation Floating Draggable Panel */}
      <GenerationPanel
        isOpen={isGenerationOpen}
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
        onOpenMasterPrompts={() => setIsMasterPromptsOpen(true)}
        currentPromptPreset={currentPromptPreset}
        products={productsList}
        onOpenProducts={() => setIsProductLibraryOpen(true)}
      />

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        id="hidden-global-file-input"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
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
        accept="image/*"
        onChange={handleSiteMockupFileChange}
        className="hidden"
      />

      {/* Modals */}
      <MasterPromptsModal
        isOpen={isMasterPromptsOpen}
        onClose={() => setIsMasterPromptsOpen(false)}
        masterPrompts={masterPrompts}
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

      <ProductLibraryDrawer
        isOpen={isProductLibraryOpen}
        onClose={() => setIsProductLibraryOpen(false)}
        products={productsList}
        onSaveProducts={handleSaveProducts}
        onAddProductToCanvas={handleAddProductToCanvas}
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

      {/* Right Drawer for Secondary/Mobile Controls */}
      <RightDrawer
        isOpen={isRightDrawerOpen}
        onClose={() => setIsRightDrawerOpen(false)}
        projectName={activeProject.name}
        storageInfo={storageInfo}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onGenerateSample={handleGenerateSample}
        onOptimizeMemory={handleOptimizeMemory}
        onClearMemory={handleClearMemory}
        isOptimizing={isOptimizing}
        onOpenMasterPrompts={() => setIsMasterPromptsOpen(true)}
        onExportProject={handleExportProject}
        onImportProject={handleImportProjectClick}
        onClearAll={handleClearAll}
        onAddSiteMockup={handleAddSiteMockupClick}
        hasSiteMockup={Boolean(activeProject.siteMockup)}
        onExportImages={handleExportImages}
      />

      <CatalogStudio
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        projectId={activeProject.id}
        projectName={activeProject.name}
        products={productsList}
        selectedCards={selectedCardsList}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Image Crop Modal for Canvas Uploads / Drops */}
      {canvasCropQueue.length > 0 && canvasCropIndex < canvasCropQueue.length && (
        <ImageCropModal
          isOpen={true}
          imageSrc={canvasCropQueue[canvasCropIndex].rawSrc}
          imageName={canvasCropQueue[canvasCropIndex].name}
          initialAspectRatio="free"
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
