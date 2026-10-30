/* eslint-disable react-hooks/exhaustive-deps */
// Keyboard: ⌘G, ⌘A, undo / redo, copy / cut / paste of board photos, the file input.
// Split out of App.tsx; App passes in what it needs and spreads back what it returns.
import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, Note, ProductItem, Project } from '../types';
import { saveProjects, saveProjectProducts } from '../utils/storage';
import { StudioView } from '../components/TopBar';
import { type UndoEntry } from './useUndo';
import { copyPictureToSystem } from '../utils/clipboard';

export interface BoardShortcutsDeps {
  activeProject: Project;
  activeProjectId: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleAddImages: (files: File[], atCanvasPos?: { x: number; y: number; }) => Promise<void>;
  handleDeleteSelection: (cardIds: string[], noteIds: string[]) => void;
  handleGroupSelected: () => void;
  handleSaveProducts: (newProducts: ProductItem[]) => void;
  handleUngroup: (groupId: string) => void;
  handleUpdateCards: (cards: Card[]) => void;
  latestProductsRef: React.RefObject<ProductItem[]>;
  latestProjectsRef: React.RefObject<Project[]>;
  projects: Project[];
  saveProjectsToStorage: (updatedProjects: Project[]) => void;
  selectedCardIds: Set<string>;
  selectedNoteIds: Set<string>;
  setProductsList: React.Dispatch<React.SetStateAction<ProductItem[]>>;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  setSelectedCardIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  studioView: StudioView;
  undo: { record: (entry: UndoEntry) => void; step: (direction: "undo" | "redo", swap: (entry: UndoEntry) => unknown | undefined) => boolean; canUndo: () => boolean; canRedo: () => boolean; };
}

export function useBoardShortcuts(deps: BoardShortcutsDeps) {
  const {
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
  } = deps;

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

  return {
    handleFileInputChange,
    selectedCardsList,
    selectedGroup,
  };
}
