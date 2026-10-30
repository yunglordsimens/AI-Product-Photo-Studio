/* eslint-disable react-hooks/exhaustive-deps */
// Positions of the active project, axes on the board, «разрезать», board → positions / catalog.
// Split out of App.tsx; App passes in what it needs and spreads back what it returns.
import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardGroup, ProductItem, Project, BoardMatrix } from '../types';
import { loadProjectProducts, saveProjectProducts, appendProductsToProject } from '../utils/storage';
import { hasGenerationAccess } from '../utils/gemini';
import { ensureVariantCols } from '../utils/positionsImport';
import { MATRIX_LABEL_H, MATRIX_LABEL_W, addLine, matrixFromPositions, isOverMatrix, matrixFromGroups, matrixToPositionDrafts, membersOf, newMatrix, removeLine, snapIntoMatrix, transposeMatrix } from '../utils/matrix';
import type { MatrixApi } from '../components/BoardMatrixView';
import { StudioView } from '../components/TopBar';
import { type UndoEntry } from './useUndo';
import { compressImageDataUrl } from '../utils/storage';
import { angleOf, slotGet } from '../utils/positions';
import { cropProducts, detectProducts } from '../utils/cutProducts';

export interface PositionsAndAxesDeps {
  activeProject: Project;
  activeProjectId: string;
  isHydrated: boolean;
  latestProductsRef: React.RefObject<ProductItem[]>;
  latestProjectsRef: React.RefObject<Project[]>;
  productsList: ProductItem[];
  projects: Project[];
  saveProjectsToStorage: (updatedProjects: Project[]) => void;
  setCatalogIncoming: React.Dispatch<React.SetStateAction<{ key: number; items: { name: string; src: string; }[]; }>>;
  setFolderImportStatus: React.Dispatch<React.SetStateAction<string>>;
  setIsProductLibraryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setProductsList: React.Dispatch<React.SetStateAction<ProductItem[]>>;
  setSelectedCardIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setStudioView: (v: StudioView) => void;
  showOnBoardRef: React.RefObject<(ids?: string[]) => void>;
  undo: { record: (entry: UndoEntry) => void; step: (direction: "undo" | "redo", swap: (entry: UndoEntry) => unknown | undefined) => boolean; canUndo: () => boolean; canRedo: () => boolean; };
}

export function usePositionsAndAxes(deps: PositionsAndAxesDeps) {
  const {
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
  } = deps;

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
      // a photo that came from a position cell goes back at full size
      const fullSize = (card: Card) => {
        if (!card.fromSlot) return undefined;
        const prod = latestProductsRef.current.find((x) => x.id === card.fromSlot!.productId);
        return prod ? slotGet(prod, card.fromSlot.slot) || undefined : undefined;
      };
      const drafts = matrixToPositionDrafts(m, p.cards || [], fullSize);
      if (drafts.length === 0) return;
      (async () => {
        const fresh: ProductItem[] = [];
        let next = [...latestProductsRef.current];
        let updated = 0;
        let n = 0;
        for (const d of drafts) {
          const photo = await compressImageDataUrl(d.photoDataUrl, 1200, 0.85);
          const variants = await Promise.all((d.variants || []).map((v) => (v ? compressImageDataUrl(v, 1200, 0.85) : Promise.resolve(null))));
          const { productId, ...draft } = d;
          const existing = m.linked && productId ? next.findIndex((x) => x.id === productId) : -1;
          if (existing >= 0) {
            // tied to a position: update it in place (same id, group, code, price)
            next[existing] = { ...next[existing], name: draft.name || next[existing].name, photoDataUrl: photo, variants, finalIndex: undefined };
            updated++;
          } else {
            fresh.push({ ...draft, id: `prod_${Date.now()}_${n++}_${Math.random().toString(36).slice(2, 6)}`, photoDataUrl: photo, variants, category: m.name && m.name !== 'Оси' && m.name !== 'Позиции' ? m.name : undefined });
          }
        }
        next = [...next, ...fresh];
        const maxVariants = Math.max(0, ...next.map((f) => f.variants?.length || 0));
        if (maxVariants) ensureVariantCols(maxVariants);
        handleSaveProducts(next);
        setIsProductLibraryOpen(true);
        setFolderImportStatus(`Из осей в позиции: обновлено ${updated}, новых ${fresh.length}. Ракурсы легли в колонки по порядку.`);
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
  /** Positions → «Оси» on the board. Products already in a linked grid are skipped; new ones are added as lines */
  const handleShowPositionsOnBoard = useCallback(
    (ids?: string[]) => {
      // wait a tick: right after an import the new positions are still on their way into state
      setTimeout(async () => {
        const p = latestProjectsRef.current.find((x) => x.id === activeProjectId);
        if (!p) return;
        const linked = (p.matrices || []).find((m) => m.linked);
        const onBoard = new Set((p.matrices || []).flatMap((m) => (m.lineProductIds || []).filter(Boolean) as string[]));
        const products = latestProductsRef.current.filter((x) => x.photoDataUrl && (!ids || ids.includes(x.id)) && !onBoard.has(x.id));
        if (products.length === 0) {
          setFolderImportStatus('Эти позиции уже на доске в осях.');
          setTimeout(() => setFolderImportStatus(null), 4000);
          return;
        }
        // card shapes need the photos' proportions
        const ratios = new Map<string, number>();
        await Promise.all(
          products.flatMap((x) => [x.photoDataUrl, ...(x.variants || [])]).filter(Boolean).map(
            (src) =>
              new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => {
                  ratios.set(src as string, (img.naturalHeight || 1) / (img.naturalWidth || 1));
                  resolve();
                };
                img.onerror = () => resolve();
                img.src = src as string;
              })
          )
        );
        const ratioOf = (src: string) => ratios.get(src) || 1;
        patchActive((proj) => {
          const cardsNow = proj.cards || [];
          if (linked && linked.productsAlong === 'rows') {
            // add the new products as lines of the existing grid
            const fresh = matrixFromPositions(linked.x, linked.y + linked.rows.length * linked.cellH, products, ratioOf);
            const cols = Math.max(linked.cols.length, fresh.matrix.cols.length);
            const matrix: BoardMatrix = {
              ...linked,
              rows: [...linked.rows, ...fresh.matrix.rows],
              cols: Array.from({ length: cols }, (_, i) => linked.cols[i] || fresh.matrix.cols[i]),
              lineProductIds: [...(linked.lineProductIds || linked.rows.map(() => null)), ...products.map((x) => x.id)],
            };
            return { ...proj, matrices: (proj.matrices || []).map((m) => (m.id === linked.id ? matrix : m)), cards: [...cardsNow, ...fresh.cards] };
          }
          // a new grid under everything on the board
          const minX = cardsNow.length ? Math.min(...cardsNow.map((c) => c.x)) : 0;
          const maxY = cardsNow.length ? Math.max(...cardsNow.map((c) => c.y + (c.height || 300))) : 0;
          const { matrix, cards } = matrixFromPositions(Math.round(minX + 200), Math.round(maxY + 200), products, ratioOf);
          const zoom = proj.zoom || 1;
          const pan = cardsNow.length ? proj.pan : { x: Math.round(40 + 200 * zoom - matrix.x * zoom), y: Math.round(90 - matrix.y * zoom) };
          return { ...proj, pan, matrices: [...(proj.matrices || []), matrix], cards: [...cardsNow, ...cards] };
        });
        setFolderImportStatus(`На доске в осях: ${products.length} позиций.`);
        setTimeout(() => setFolderImportStatus(null), 5000);
      }, 60);
    },
    [activeProjectId, patchActive]
  );
  showOnBoardRef.current = handleShowPositionsOnBoard;
  /** «разрезать на товары»: find each product on the photo and lay the cut-outs next to it, as one group */
  const handleCutCard = useCallback(
    async (card: Card) => {
      if (!hasGenerationAccess()) {
        setIsSettingsOpen(true);
        return;
      }
      setFolderImportStatus(`Ищу товары на «${card.name || 'фото'}»…`);
      try {
        const found = await detectProducts(card.src);
        if (found.length < 2) {
          setFolderImportStatus(found.length ? 'Нашёлся один товар — резать нечего.' : 'Товаров на фото не нашлось.');
          setTimeout(() => setFolderImportStatus(null), 5000);
          return;
        }
        const pieces = await cropProducts(card.src, found);
        patchActive((proj) => {
          let z = (proj.cards || []).reduce((m, c) => Math.max(m, c.zIndex || 1), 1);
          let x = card.x + card.width + 80;
          const cards: Card[] = pieces.map((piece, i) => {
            const w = 180;
            const h = Math.round(w * (piece.h / piece.w));
            const c: Card = {
              id: `card_cut_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
              x: Math.round(x),
              y: Math.round(card.y),
              width: w,
              height: h,
              src: piece.src,
              name: piece.label,
              aspectRatio: w / h,
              zIndex: ++z,
            };
            x += w + 24;
            return c;
          });
          const group: CardGroup = {
            id: `group_cut_${Date.now()}`,
            type: 'group',
            name: `${card.name || 'фото'} · товары`,
            children: cards.map((c) => c.id),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            color: '#0a0a0a',
          };
          return { ...proj, cards: [...(proj.cards || []), ...cards], groups: [...(proj.groups || []), group] };
        });
        setFolderImportStatus(`Вырезано товаров: ${pieces.length}. Дальше можно «в каталог» или «в позиции».`);
        setTimeout(() => setFolderImportStatus(null), 6000);
      } catch (err) {
        setFolderImportStatus(`Не получилось разрезать: ${err instanceof Error ? err.message : String(err)}`);
        setTimeout(() => setFolderImportStatus(null), 7000);
      }
    },
    [patchActive]
  );
  /** A photo dragged out of a position cell onto the board */
  const handleDropSlot = useCallback(
    (ref: { id: string; slot: number }, pos: { x: number; y: number }) => {
      const prod = latestProductsRef.current.find((x) => x.id === ref.id);
      const src = prod ? slotGet(prod, ref.slot) : '';
      if (!prod || !src) return;
      const img = new Image();
      img.onload = () => {
        const w = 220;
        const h = Math.round(w * ((img.naturalHeight || 1) / (img.naturalWidth || 1)));
        patchActive((proj) => {
          const z = (proj.cards || []).reduce((m, c) => Math.max(m, c.zIndex || 1), 1) + 1;
          const card: Card = {
            id: `card_slot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            x: Math.round(pos.x),
            y: Math.round(pos.y),
            width: w,
            height: h,
            src,
            name: [prod.name, angleOf(prod, ref.slot)].filter(Boolean).join(' · '),
            aspectRatio: w / h,
            zIndex: z,
            fromSlot: { productId: prod.id, slot: ref.slot },
          };
          return { ...proj, cards: [...(proj.cards || []), card] };
        });
      };
      img.src = src;
    },
    [patchActive]
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

  return {
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
  };
}
