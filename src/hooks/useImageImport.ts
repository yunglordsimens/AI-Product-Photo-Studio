/* eslint-disable react-hooks/exhaustive-deps */
// Photos and folders coming in: crop queue, folder → board / positions, products dropped on the board.
// Split out of App.tsx; App passes in what it needs and spreads back what it returns.
import React, { useCallback, useRef } from 'react';
import { Card, CardGroup, ProductItem, Project } from '../types';
import { getStorageUsage, saveProjectProducts } from '../utils/storage';
import { compressDataUrl, createSampleCard } from '../utils/imageUtils';
import { isImageFile, normalizeImageFiles } from '../utils/heic';
import { FolderFile, groupByFolder, folderFilesFromInput, snapshotFolderFiles } from '../utils/folderImport';
import { ensureVariantCols, folderImportNote, importFolderToPositions, splitSku } from '../utils/positionsImport';
import { CropAspectRatio, cropRatioValue } from '../components/ImageCropModal';
import { CanvasCropQueueItem } from '../studio/shared';

export interface ImageImportDeps {
  activeProject: Project;
  activeProjectId: string;
  canvasCropIndex: number;
  canvasCropQueue: CanvasCropQueueItem[];
  handleUpdateCards: (cards: Card[]) => void;
  pendingCanvasCards: Card[];
  productsList: ProductItem[];
  projects: Project[];
  saveProjectsToStorage: (updatedProjects: Project[]) => void;
  setCanvasCropIndex: React.Dispatch<React.SetStateAction<number>>;
  setCanvasCropQueue: React.Dispatch<React.SetStateAction<CanvasCropQueueItem[]>>;
  setFolderImportStatus: React.Dispatch<React.SetStateAction<string>>;
  setIsProductLibraryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingCanvasCards: React.Dispatch<React.SetStateAction<Card[]>>;
  setPendingFolder: React.Dispatch<React.SetStateAction<{ files: FolderFile[]; pos?: { x: number; y: number; }; }>>;
  setProductsList: React.Dispatch<React.SetStateAction<ProductItem[]>>;
  setSelectedCardIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setStorageWarning: React.Dispatch<React.SetStateAction<string>>;
}

export function useImageImport(deps: ImageImportDeps) {
  const {
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
  } = deps;

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
  const askAboutFolder = useCallback((files: FolderFile[], pos?: { x: number; y: number }) => {
    if (files.length > 0) setPendingFolder({ files, pos });
  }, []);
  /** Set further down: lays positions out on the board as «Оси» */
  const showOnBoardRef = useRef<((ids?: string[]) => void) | null>(null);
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
      // the same products appear on the board as «Оси»
      const before = new Set(productsList.map((p) => p.id));
      const fresh = r.next.filter((p) => !before.has(p.id)).map((p) => p.id);
      if (fresh.length) showOnBoardRef.current?.(fresh);
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

  return {
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
  };
}
