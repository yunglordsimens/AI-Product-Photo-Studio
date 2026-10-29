import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { BoardMatrixView, MatrixApi } from './BoardMatrixView';
import { Card, CardGroup, Connection, MarqueeBox, Note, NoteColor, Project, SiteMockup } from '../types';
import { CardItem } from './CardItem';
import { NoteItem } from './NoteItem';
import { ZoomControls } from './ZoomControls';
import { isImageFile } from '../utils/heic';
import { FolderFile, collectFolderFiles, folderEntriesFromDrop } from '../utils/folderImport';
import { PRODUCT_DRAG_TYPE } from '../utils/dragTypes';
import { SLOT_DRAG_TYPE } from '../utils/positions';

interface CanvasProps {
  project: Project;
  selectedCardIds: Set<string>;
  selectedNoteIds: Set<string>;
  pan: { x: number; y: number };
  zoom: number;
  onUpdatePanZoom: (pan: { x: number; y: number }, zoom: number) => void;
  onUpdateCards: (cards: Card[]) => void;
  onUpdateNotes: (notes: Note[]) => void;
  onSelectCards: (selectedIds: Set<string>) => void;
  onSelectNotes: (selectedIds: Set<string>) => void;
  onDeleteCard: (cardId: string) => void;
  onDuplicateCard: (card: Card) => void;
  onPreviewCard: (card: Card) => void;
  onAddImages: (files: File[], atCanvasPos?: { x: number; y: number }) => void;
  onAddFolder?: (files: FolderFile[], atCanvasPos?: { x: number; y: number }) => void;
  onDropProducts?: (productIds: string[], atCanvasPos: { x: number; y: number }) => void;
  /** One photo dragged out of a position cell */
  onDropSlot?: (ref: { id: string; slot: number }, atCanvasPos: { x: number; y: number }) => void;
  /** Board photos dropped on a position row (slot -1 = original, 0.. = variant column, undefined = first free) */
  onDropCardsOnPosition?: (cardIds: string[], positionId: string, slot?: number) => void;
  onChangeCardTakes?: (cardId: string, takes: string[]) => void;
  onEditCard?: (cardId: string, instruction: string, promptName?: string) => void;
  quickEditPrompts?: { id: string; name: string; prompt: string }[];
  isGenerating?: boolean;
  onDeleteSelection?: (cardIds: string[], noteIds: string[]) => void;
  onImportFolder?: (kind: 'products' | 'board' | 'ask') => void;
  onAddNote: (note: Note) => void;
  onDeleteNote: (noteId: string) => void;
  onUpdateNoteText: (noteId: string, text: string) => void;
  onUpdateNoteColor: (noteId: string, color: NoteColor) => void;
  onUpdateNoteSize: (noteId: string, width: number, height: number) => void;
  onDetachNote: (noteId: string) => void;
  isConnectionMode?: boolean;
  onToggleConnectionMode?: () => void;
  connectingSourceCardId?: string | null;
  onSetConnectingSourceCardId?: (cardId: string | null) => void;
  onAddConnection?: (fromCardId: string, toCardId: string) => void;
  onDeleteConnection?: (connectionId: string) => void;
  selectedConnectionId?: string | null;
  onSelectConnection?: (connectionId: string | null) => void;
  onGroupSelected?: () => void;
  onUngroup?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, name: string) => void;
  /** A photo made with a master prompt can become that prompt's example */
  onMakeExample?: (card: Card) => void;
  examplePromptNames?: Set<string>;
  onCutCard?: (card: Card) => void;
  /** The group becomes one position: first photo = original, the rest = angles */
  onGroupToPosition?: (groupId: string) => void;
  /** «Оси» grids on the board */
  matrixApi?: MatrixApi;
  onAddMatrix?: (at: { x: number; y: number }) => void;
  /** Cards were dragged and let go on the board (not on a position) */
  onCardsDragEnd?: (cardIds: string[]) => void;
  onAnalyzeStyle?: () => void;
  onUpdateSiteMockup?: (mockup: SiteMockup | undefined) => void;
  onDeleteSiteMockup?: () => void;
  onChangeSiteMockupOpacity?: (opacity: number) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  project,
  selectedCardIds,
  selectedNoteIds,
  pan,
  zoom,
  onUpdatePanZoom,
  onUpdateCards,
  onUpdateNotes,
  onSelectCards,
  onSelectNotes,
  onDeleteCard,
  onDuplicateCard,
  onPreviewCard,
  onAddImages,
  onAddFolder,
  onDropProducts,
  onDropSlot,
  onDropCardsOnPosition,
  onChangeCardTakes,
  onEditCard,
  quickEditPrompts,
  isGenerating,
  onDeleteSelection,
  onImportFolder,
  onAddNote,
  onDeleteNote,
  onUpdateNoteText,
  onUpdateNoteColor,
  onUpdateNoteSize,
  onDetachNote,
  isConnectionMode = false,
  onToggleConnectionMode,
  connectingSourceCardId = null,
  onSetConnectingSourceCardId,
  onAddConnection,
  onDeleteConnection,
  selectedConnectionId = null,
  onSelectConnection,
  onGroupSelected,
  onUngroup,
  onRenameGroup,
  onMakeExample,
  examplePromptNames,
  onCutCard,
  onGroupToPosition,
  matrixApi,
  onAddMatrix,
  onCardsDragEnd,
  onAnalyzeStyle,
  onUpdateSiteMockup,
  onDeleteSiteMockup,
  onChangeSiteMockupOpacity,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Mouse Interaction states
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingCards, setIsDraggingCards] = useState(false);
  const [isDraggingNotes, setIsDraggingNotes] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Position tracking refs
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialSelectedOnMarqueeStart = useRef<{
    cards: Set<string>;
    notes: Set<string>;
  }>({
    cards: new Set(),
    notes: new Set(),
  });

  // Synchronized state refs for 60fps glitch-free drag & drop
  const cardsRef = useRef(project.cards || []);
  cardsRef.current = project.cards || [];

  const notesRef = useRef(project.notes || []);
  notesRef.current = project.notes || [];

  const panRef = useRef(pan);
  panRef.current = pan;

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const selectedCardIdsRef = useRef(selectedCardIds);
  selectedCardIdsRef.current = selectedCardIds;

  const selectedNoteIdsRef = useRef(selectedNoteIds);
  selectedNoteIdsRef.current = selectedNoteIds;

  const draggedCardIdsRef = useRef<Set<string>>(new Set());
  const draggedNoteIdsRef = useRef<Set<string>>(new Set());
  const isDraggingCardsRef = useRef(false);
  const isDraggingNotesRef = useRef(false);
  const isPanningRef = useRef(false);

  // Touch tracking refs
  const touchStateRef = useRef<{
    mode: 'idle' | 'pan' | 'pinch' | 'drag-card' | 'drag-note';
    lastPos: { x: number; y: number };
    startPos: { x: number; y: number };
    initialPinchDist: number;
    initialPinchZoom: number;
    pinchCenter: { x: number; y: number };
    cardId?: string;
    noteId?: string;
    lastTapTime?: number;
  }>({
    mode: 'idle',
    lastPos: { x: 0, y: 0 },
    startPos: { x: 0, y: 0 },
    initialPinchDist: 0,
    initialPinchZoom: 1,
    pinchCenter: { x: 0, y: 0 },
  });

  // Dragging / Resizing Site Mockup refs
  const isDraggingMockupRef = useRef(false);
  const isResizingMockupRef = useRef(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    cardId?: string;
    groupId?: string;
    isMockup?: boolean;
  }>({ visible: false, x: 0, y: 0 });

  // Coordinate Conversion: Screen -> Canvas World Space
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = screenX - rect.left;
      const clientY = screenY - rect.top;
      return {
        x: Math.round((clientX - pan.x) / zoom),
        y: Math.round((clientY - pan.y) / zoom),
      };
    },
    [pan, zoom]
  );

  // Keyboard events: Space for panning, Delete/Backspace for removing selected items, Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (e.code === 'Space' && !isInput) {
        setIsSpaceDown(true);
      }

      if (e.key === 'Escape') {
        if (isConnectionMode && onToggleConnectionMode) {
          onToggleConnectionMode();
        }
        if (connectingSourceCardId && onSetConnectingSourceCardId) {
          onSetConnectingSourceCardId(null);
        }
        if (contextMenu.visible) {
          setContextMenu((prev) => ({ ...prev, visible: false }));
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput && onDeleteSelection && (selectedCardIds.size + selectedNoteIds.size) > 1) {
        onDeleteSelection([...selectedCardIds], [...selectedNoteIds]);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        if (selectedCardIds.size > 0) {
          selectedCardIds.forEach((id) => onDeleteCard(id));
          onSelectCards(new Set());
        }
        if (selectedNoteIds.size > 0) {
          selectedNoteIds.forEach((id) => onDeleteNote(id));
          onSelectNotes(new Set());
        }
        if (selectedConnectionId && onDeleteConnection) {
          onDeleteConnection(selectedConnectionId);
          if (onSelectConnection) onSelectConnection(null);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceDown(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    isConnectionMode,
    connectingSourceCardId,
    selectedCardIds,
    selectedNoteIds,
    selectedConnectionId,
    contextMenu.visible,
    onDeleteCard,
    onDeleteNote,
    onDeleteConnection,
    onSelectCards,
    onSelectNotes,
    onSelectConnection,
    onSetConnectingSourceCardId,
    onToggleConnectionMode,
    onDeleteSelection,
  ]);

  // Zoom Controls
  const handleZoomIn = () => {
    const nextZoom = Math.min(zoom * 1.25, 4.0);
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newPan = {
      x: cx - (cx - pan.x) * (nextZoom / zoom),
      y: cy - (cy - pan.y) * (nextZoom / zoom),
    };
    onUpdatePanZoom(newPan, nextZoom);
  };

  const handleZoomOut = () => {
    const nextZoom = Math.max(zoom / 1.25, 0.1);
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newPan = {
      x: cx - (cx - pan.x) * (nextZoom / zoom),
      y: cy - (cy - pan.y) * (nextZoom / zoom),
    };
    onUpdatePanZoom(newPan, nextZoom);
  };

  const handleResetZoom = () => {
    onUpdatePanZoom({ x: 0, y: 0 }, 1.0);
  };

  // Zoom so that the given box fills the view
  const fitBounds = (minX: number, minY: number, maxX: number, maxY: number, maxZoom = 1.2) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const padding = 60;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const z = Math.max(0.15, Math.min((rect.width - padding * 2) / w, (rect.height - padding * 2) / h, maxZoom));
    onUpdatePanZoom({ x: rect.width / 2 - (minX + w / 2) * z, y: rect.height / 2 - (minY + h / 2) * z }, z);
  };

  // Focus on one group: the view zooms to it and everything else fades back
  const [focusGroupId, setFocusGroupIdState] = useState<string | null>(null);
  // Leaving focus brings back the view from before it
  const viewBeforeFocusRef = useRef<{ pan: { x: number; y: number }; zoom: number } | null>(null);
  const setFocusGroupId = (id: string | null) => {
    if (id === null && viewBeforeFocusRef.current) {
      onUpdatePanZoom(viewBeforeFocusRef.current.pan, viewBeforeFocusRef.current.zoom);
      viewBeforeFocusRef.current = null;
    }
    setFocusGroupIdState(id);
  };
  const focusGroup = (project.groups || []).find((g) => g.id === focusGroupId) || null;
  const focusIds = useMemo(() => new Set(focusGroup?.children || []), [focusGroup]);
  const enterFocus = (groupId: string) => {
    const g = (project.groups || []).find((x) => x.id === groupId);
    const members = (project.cards || []).filter((c) => g?.children.includes(c.id));
    if (!g || members.length === 0) return;
    if (!viewBeforeFocusRef.current) viewBeforeFocusRef.current = { pan: { ...pan }, zoom };
    setFocusGroupIdState(groupId);
    fitBounds(
      Math.min(...members.map((c) => c.x)),
      Math.min(...members.map((c) => c.y)),
      Math.max(...members.map((c) => c.x + c.width)),
      Math.max(...members.map((c) => c.y + (c.height || 300))),
      2
    );
  };
  useEffect(() => {
    if (!focusGroupId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFocusGroupId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusGroupId]);
  useEffect(() => {
    if (focusGroupId && !focusGroup) setFocusGroupId(null);
  }, [focusGroupId, focusGroup]);

  const handleFitCards = () => {
    const allCards = project.cards || [];
    const allNotes = project.notes || [];
    if (allCards.length === 0 && allNotes.length === 0) {
      handleResetZoom();
      return;
    }
    if (!containerRef.current) return;

    const xs = [
      ...allCards.map((c) => c.x),
      ...allCards.map((c) => c.x + c.width),
      ...allNotes.map((n) => n.x),
      ...allNotes.map((n) => n.x + (n.width || 180)),
    ];
    const ys = [
      ...allCards.map((c) => c.y),
      ...allCards.map((c) => c.y + (c.height || 300)),
      ...allNotes.map((n) => n.y),
      ...allNotes.map((n) => n.y + (n.height || 140)),
    ];

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const boundingW = maxX - minX;
    const boundingH = maxY - minY;

    const rect = containerRef.current.getBoundingClientRect();
    const padding = 80;
    const targetW = rect.width - padding * 2;
    const targetH = rect.height - padding * 2;

    const scale = Math.min(targetW / boundingW, targetH / boundingH, 1.2);
    const finalZoom = Math.max(0.15, Math.min(scale, 2.0));

    const centerX = minX + boundingW / 2;
    const centerY = minY + boundingH / 2;

    const newPan = {
      x: rect.width / 2 - centerX * finalZoom,
      y: rect.height / 2 - centerY * finalZoom,
    };

    onUpdatePanZoom(newPan, finalZoom);
  };

  // Wheel handler: panning, and zooming with cursor focus.
  // Trackpad pinch arrives as wheel + ctrlKey. React's onWheel is passive, so the
  // browser would still zoom the whole page; we attach a native non-passive listener below.
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    if (e.ctrlKey || e.metaKey) {
      // Smooth for pinch (many small deltas) and for mouse wheel (few big ones)
      const delta = Math.max(-40, Math.min(40, e.deltaY));
      const zoomFactor = Math.exp(-delta * 0.006);
      const nextZoom = Math.max(0.1, Math.min(zoom * zoomFactor, 4.0));

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newPan = {
        x: mouseX - (mouseX - pan.x) * (nextZoom / zoom),
        y: mouseY - (mouseY - pan.y) * (nextZoom / zoom),
      };

      onUpdatePanZoom(newPan, nextZoom);
    } else {
      onUpdatePanZoom({ x: pan.x - e.deltaX, y: pan.y - e.deltaY }, zoom);
    }
  };

  const wheelHandlerRef = useRef(handleWheel);
  wheelHandlerRef.current = handleWheel;
  const onUpdatePanZoomRef = useRef(onUpdatePanZoom);
  onUpdatePanZoomRef.current = onUpdatePanZoom;
  const gestureStartRef = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => wheelHandlerRef.current(e);
    // Safari (incl. "Add to Dock" web apps) sends trackpad pinch as gesture events, not ctrl+wheel:
    // stop the page zoom and zoom the canvas instead.
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStartRef.current = { zoom: zoomRef.current, pan: panRef.current };
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
      const start = gestureStartRef.current;
      if (!start || !g.scale || !containerRef.current) return;
      const nextZoom = Math.max(0.1, Math.min(start.zoom * g.scale, 4.0));
      const rect = containerRef.current.getBoundingClientRect();
      const mx = (g.clientX ?? rect.left + rect.width / 2) - rect.left;
      const my = (g.clientY ?? rect.top + rect.height / 2) - rect.top;
      onUpdatePanZoomRef.current(
        {
          x: mx - (mx - start.pan.x) * (nextZoom / start.zoom),
          y: my - (my - start.pan.y) * (nextZoom / start.zoom),
        },
        nextZoom
      );
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      gestureStartRef.current = null;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    el.addEventListener('gestureend', onGestureEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', onGestureEnd);
    };
  }, []);

  // Double click canvas to create sticky note
  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current && (e.target as HTMLElement).id !== 'canvas-grid-background') {
      return;
    }
    const world = screenToCanvas(e.clientX, e.clientY);
    const newNote: Note = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      x: world.x,
      y: world.y,
      width: 180,
      height: 140,
      text: '',
      color: 'yellow',
      attachedTo: null,
    };
    onAddNote(newNote);
    onSelectNotes(new Set([newNote.id]));
    onSelectCards(new Set());
  };

  // Context Menu on Canvas
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      isMockup: Boolean(project.siteMockup),
    });
  };

  // Mouse down on canvas background
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (contextMenu.visible) {
      setContextMenu((prev) => ({ ...prev, visible: false }));
    }

    if (e.button === 1 || (e.button === 0 && isSpaceDown)) {
      isPanningRef.current = true;
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (e.button === 0) {
      if (isConnectionMode && onSetConnectingSourceCardId) {
        onSetConnectingSourceCardId(null);
      }
      if (onSelectConnection) {
        onSelectConnection(null);
      }

      if (!e.shiftKey) {
        onSelectCards(new Set());
        onSelectNotes(new Set());
        selectedCardIdsRef.current = new Set();
        selectedNoteIdsRef.current = new Set();
        initialSelectedOnMarqueeStart.current = { cards: new Set(), notes: new Set() };
      } else {
        initialSelectedOnMarqueeStart.current = {
          cards: new Set(selectedCardIdsRef.current),
          notes: new Set(selectedNoteIdsRef.current),
        };
      }

      if (!isConnectionMode) {
        setMarquee({
          startX: e.clientX,
          startY: e.clientY,
          currentX: e.clientX,
          currentY: e.clientY,
        });
      }
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  // Mouse down on a card
  const handleCardMouseDown = useCallback(
    (e: React.MouseEvent, cardId: string) => {
      if (isSpaceDown || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      if (isConnectionMode) {
        if (onSelectConnection) onSelectConnection(null);
        if (!connectingSourceCardId) {
          if (onSetConnectingSourceCardId) onSetConnectingSourceCardId(cardId);
        } else if (connectingSourceCardId === cardId) {
          if (onSetConnectingSourceCardId) onSetConnectingSourceCardId(null);
        } else {
          if (onAddConnection) onAddConnection(connectingSourceCardId, cardId);
          if (onSetConnectingSourceCardId) onSetConnectingSourceCardId(null);
        }
        return;
      }

      let newSelection: Set<string>;
      const currentSelected = selectedCardIdsRef.current;

      if (e.shiftKey) {
        newSelection = new Set(currentSelected);
        if (newSelection.has(cardId)) {
          newSelection.delete(cardId);
        } else {
          newSelection.add(cardId);
        }
      } else {
        if (currentSelected.has(cardId)) {
          newSelection = new Set(currentSelected);
        } else {
          // Photos inside a group move one by one; the whole group moves by its label or empty area
          newSelection = new Set([cardId]);
        }
        onSelectNotes(new Set());
        selectedNoteIdsRef.current = new Set();
      }

      if (onSelectConnection) onSelectConnection(null);
      onSelectCards(newSelection);
      selectedCardIdsRef.current = newSelection;

      // Start dragging cards + attached notes
      draggedCardIdsRef.current = new Set(newSelection);
      isDraggingCardsRef.current = true;
      setIsDraggingCards(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    },
    [
      isSpaceDown,
      isConnectionMode,
      connectingSourceCardId,
      project.groups,
      onSelectCards,
      onSelectNotes,
      onSetConnectingSourceCardId,
      onAddConnection,
      onSelectConnection,
    ]
  );

  // Mouse down on a group boundary/header
  const handleGroupMouseDown = useCallback(
    (e: React.MouseEvent, group: CardGroup) => {
      if (isSpaceDown || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      const memberIds = new Set(group.children);
      onSelectCards(memberIds);
      onSelectNotes(new Set());
      selectedCardIdsRef.current = memberIds;
      selectedNoteIdsRef.current = new Set();
      if (onSelectConnection) onSelectConnection(null);

      draggedCardIdsRef.current = memberIds;
      isDraggingCardsRef.current = true;
      setIsDraggingCards(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    },
    [isSpaceDown, onSelectCards, onSelectNotes, onSelectConnection]
  );

  // Mouse down on a note
  const handleNoteMouseDown = useCallback(
    (e: React.MouseEvent, noteId: string) => {
      if (isSpaceDown || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      let newSelection: Set<string>;
      const currentSelected = selectedNoteIdsRef.current;

      if (e.shiftKey) {
        newSelection = new Set(currentSelected);
        if (newSelection.has(noteId)) {
          newSelection.delete(noteId);
        } else {
          newSelection.add(noteId);
        }
      } else {
        if (currentSelected.has(noteId)) {
          newSelection = new Set(currentSelected);
        } else {
          newSelection = new Set([noteId]);
        }
        onSelectCards(new Set());
        selectedCardIdsRef.current = new Set();
      }

      onSelectNotes(newSelection);
      selectedNoteIdsRef.current = newSelection;

      draggedNoteIdsRef.current = new Set(newSelection);
      isDraggingNotesRef.current = true;
      setIsDraggingNotes(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    },
    [isSpaceDown, onSelectNotes, onSelectCards]
  );

  // Site Mockup Mouse Down
  const handleSiteMockupMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isSpaceDown || e.button !== 0) return;
      e.stopPropagation();
      isDraggingMockupRef.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDraggingMockupRef.current || !project.siteMockup) return;
        const dx = (ev.clientX - lastMousePos.current.x) / zoom;
        const dy = (ev.clientY - lastMousePos.current.y) / zoom;
        lastMousePos.current = { x: ev.clientX, y: ev.clientY };

        if (onUpdateSiteMockup) {
          onUpdateSiteMockup({
            ...project.siteMockup,
            x: Math.round(project.siteMockup.x + dx),
            y: Math.round(project.siteMockup.y + dy),
          });
        }
      };

      const handleMouseUp = () => {
        isDraggingMockupRef.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [isSpaceDown, project.siteMockup, zoom, onUpdateSiteMockup]
  );

  const handleSiteMockupResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      isResizingMockupRef.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isResizingMockupRef.current || !project.siteMockup) return;
        const dx = (ev.clientX - lastMousePos.current.x) / zoom;
        const dy = (ev.clientY - lastMousePos.current.y) / zoom;
        lastMousePos.current = { x: ev.clientX, y: ev.clientY };

        const currentW = project.siteMockup.width || 960;
        const currentH = project.siteMockup.height || 640;

        if (onUpdateSiteMockup) {
          onUpdateSiteMockup({
            ...project.siteMockup,
            width: Math.max(200, Math.round(currentW + dx)),
            height: Math.max(150, Math.round(currentH + dy)),
          });
        }
      };

      const handleMouseUp = () => {
        isResizingMockupRef.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [project.siteMockup, zoom, onUpdateSiteMockup]
  );

  // Dragging photos onto a position row in the products panel (it lies above the board)
  const dropTargetRef = useRef<HTMLElement | null>(null);
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const positionTargetAt = (x: number, y: number): HTMLElement | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return (el?.closest('[data-position-slot]') || el?.closest('[data-position-id]')) as HTMLElement | null;
  };
  const markDropTarget = (el: HTMLElement | null) => {
    if (dropTargetRef.current === el) return;
    dropTargetRef.current?.classList.remove('ofst-drop-target');
    el?.classList.add('ofst-drop-target');
    dropTargetRef.current = el;
  };
  const onDropCardsOnPositionRef = useRef(onDropCardsOnPosition);
  const onCardsDragEndRef = useRef(onCardsDragEnd);
  onCardsDragEndRef.current = onCardsDragEnd;
  onDropCardsOnPositionRef.current = onDropCardsOnPosition;

  // Global mouse move and up handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;

      // Panning canvas
      if (isPanningRef.current) {
        const curPan = panRef.current;
        const curZoom = zoomRef.current;
        onUpdatePanZoom({ x: curPan.x + dx, y: curPan.y + dy }, curZoom);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Dragging cards (and attached notes move along)
      if (isDraggingCardsRef.current) {
        const curZoom = zoomRef.current || 1;
        const worldDx = dx / curZoom;
        const worldDy = dy / curZoom;
        const activeIds = draggedCardIdsRef.current;
        if (!dragStartPositionsRef.current) {
          dragStartPositionsRef.current = new Map([
            ...cardsRef.current.filter((c) => activeIds.has(c.id)).map((c) => [c.id, { x: c.x, y: c.y }] as const),
            ...notesRef.current
              .filter((n) => n.attachedTo && activeIds.has(n.attachedTo))
              .map((n) => [`note:${n.id}`, { x: n.x, y: n.y }] as const),
          ]);
        }
        markDropTarget(onDropCardsOnPositionRef.current ? positionTargetAt(e.clientX, e.clientY) : null);

        const updatedCards = cardsRef.current.map((c) => {
          if (activeIds.has(c.id)) {
            return {
              ...c,
              x: Math.round(c.x + worldDx),
              y: Math.round(c.y + worldDy),
            };
          }
          return c;
        });

        cardsRef.current = updatedCards;
        onUpdateCards(updatedCards);

        let hasNotesChanged = false;
        const updatedNotes = notesRef.current.map((n) => {
          if (n.attachedTo && activeIds.has(n.attachedTo)) {
            hasNotesChanged = true;
            return {
              ...n,
              x: Math.round(n.x + worldDx),
              y: Math.round(n.y + worldDy),
            };
          }
          return n;
        });

        if (hasNotesChanged) {
          notesRef.current = updatedNotes;
          onUpdateNotes(updatedNotes);
        }

        lastMousePos.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Dragging notes
      if (isDraggingNotesRef.current) {
        const curZoom = zoomRef.current || 1;
        const worldDx = dx / curZoom;
        const worldDy = dy / curZoom;
        const activeIds = draggedNoteIdsRef.current;

        const updatedNotes = notesRef.current.map((n) => {
          if (activeIds.has(n.id)) {
            return {
              ...n,
              x: Math.round(n.x + worldDx),
              y: Math.round(n.y + worldDy),
            };
          }
          return n;
        });

        notesRef.current = updatedNotes;
        onUpdateNotes(updatedNotes);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Marquee box drawing
      if (marquee && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const curX = Math.max(rect.left, Math.min(e.clientX, rect.right));
        const curY = Math.max(rect.top, Math.min(e.clientY, rect.bottom));

        setMarquee((prev) => (prev ? { ...prev, currentX: curX, currentY: curY } : null));

        const x1 = Math.min(marquee.startX, curX);
        const y1 = Math.min(marquee.startY, curY);
        const x2 = Math.max(marquee.startX, curX);
        const y2 = Math.max(marquee.startY, curY);

        const startCanvas = screenToCanvas(x1, y1);
        const endCanvas = screenToCanvas(x2, y2);

        const boxMinX = Math.min(startCanvas.x, endCanvas.x);
        const boxMaxX = Math.max(startCanvas.x, endCanvas.x);
        const boxMinY = Math.min(startCanvas.y, endCanvas.y);
        const boxMaxY = Math.max(startCanvas.y, endCanvas.y);

        const newSelectedCards = new Set(initialSelectedOnMarqueeStart.current.cards);
        const newSelectedNotes = new Set(initialSelectedOnMarqueeStart.current.notes);

        cardsRef.current.forEach((c) => {
          const cardRight = c.x + c.width;
          const cardBottom = c.y + (c.height || 300);
          const intersects = !(
            c.x > boxMaxX ||
            cardRight < boxMinX ||
            c.y > boxMaxY ||
            cardBottom < boxMinY
          );
          if (intersects) newSelectedCards.add(c.id);
        });

        notesRef.current.forEach((n) => {
          const noteRight = n.x + (n.width || 180);
          const noteBottom = n.y + (n.height || 140);
          const intersects = !(
            n.x > boxMaxX ||
            noteRight < boxMinX ||
            n.y > boxMaxY ||
            noteBottom < boxMinY
          );
          if (intersects) newSelectedNotes.add(n.id);
        });

        selectedCardIdsRef.current = newSelectedCards;
        selectedNoteIdsRef.current = newSelectedNotes;
        onSelectCards(newSelectedCards);
        onSelectNotes(newSelectedNotes);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Dropped on a position: the photo goes into that row, and the card returns to where it was on the board
      const target = isDraggingCardsRef.current && onDropCardsOnPositionRef.current ? positionTargetAt(e.clientX, e.clientY) : null;
      markDropTarget(null);
      if (target && onDropCardsOnPositionRef.current) {
        const positionId = target.dataset.positionId || target.closest<HTMLElement>('[data-position-id]')?.dataset.positionId;
        const slotAttr = target.dataset.positionSlot;
        const ids = [...draggedCardIdsRef.current];
        const start = dragStartPositionsRef.current;
        if (start) {
          const restored = cardsRef.current.map((c) => (start.has(c.id) ? { ...c, ...start.get(c.id)! } : c));
          cardsRef.current = restored;
          onUpdateCards(restored);
          if (notesRef.current.some((n) => start.has(`note:${n.id}`))) {
            const restoredNotes = notesRef.current.map((n) => (start.has(`note:${n.id}`) ? { ...n, ...start.get(`note:${n.id}`)! } : n));
            notesRef.current = restoredNotes;
            onUpdateNotes(restoredNotes);
          }
        }
        if (positionId) onDropCardsOnPositionRef.current(ids, positionId, slotAttr !== undefined ? Number(slotAttr) : undefined);
      } else if (isDraggingCardsRef.current && dragStartPositionsRef.current && onCardsDragEndRef.current) {
        onCardsDragEndRef.current([...draggedCardIdsRef.current]);
      }
      dragStartPositionsRef.current = null;
      isPanningRef.current = false;
      isDraggingCardsRef.current = false;
      isDraggingNotesRef.current = false;
      setIsPanning(false);
      setIsDraggingCards(false);
      setIsDraggingNotes(false);
      setMarquee(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    marquee,
    onUpdatePanZoom,
    onUpdateCards,
    onUpdateNotes,
    onSelectCards,
    onSelectNotes,
    screenToCanvas,
  ]);

  // ==========================================
  // TOUCH GESTURE HANDLERS (Mobile / Tablet)
  // ==========================================

  // Card Touch Start
  const handleCardTouchStart = useCallback(
    (e: React.TouchEvent, cardId: string) => {
      if (e.touches.length > 1) return;
      e.stopPropagation();

      const touch = e.touches[0];
      const now = Date.now();

      if (isConnectionMode) {
        if (onSelectConnection) onSelectConnection(null);
        if (!connectingSourceCardId) {
          if (onSetConnectingSourceCardId) onSetConnectingSourceCardId(cardId);
        } else if (connectingSourceCardId === cardId) {
          if (onSetConnectingSourceCardId) onSetConnectingSourceCardId(null);
        } else {
          if (onAddConnection) onAddConnection(connectingSourceCardId, cardId);
          if (onSetConnectingSourceCardId) onSetConnectingSourceCardId(null);
        }
        return;
      }

      let newSelection: Set<string>;
      const currentSelected = selectedCardIdsRef.current;
      const parentGroup = (project.groups || []).find((g) => g.children.includes(cardId));

      if (currentSelected.has(cardId)) {
        newSelection = new Set(currentSelected);
      } else {
        newSelection = new Set();
        if (parentGroup) {
          parentGroup.children.forEach((cid) => newSelection.add(cid));
        } else {
          newSelection.add(cardId);
        }
      }

      onSelectCards(newSelection);
      onSelectNotes(new Set());
      selectedCardIdsRef.current = newSelection;
      selectedNoteIdsRef.current = new Set();
      if (onSelectConnection) onSelectConnection(null);

      draggedCardIdsRef.current = new Set(newSelection);
      isDraggingCardsRef.current = true;

      touchStateRef.current = {
        mode: 'drag-card',
        lastPos: { x: touch.clientX, y: touch.clientY },
        startPos: { x: touch.clientX, y: touch.clientY },
        initialPinchDist: 0,
        initialPinchZoom: zoomRef.current,
        pinchCenter: { x: touch.clientX, y: touch.clientY },
        cardId,
        lastTapTime: now,
      };
      lastMousePos.current = { x: touch.clientX, y: touch.clientY };
    },
    [
      isConnectionMode,
      connectingSourceCardId,
      project.groups,
      onSelectCards,
      onSelectNotes,
      onSelectConnection,
      onSetConnectingSourceCardId,
      onAddConnection,
    ]
  );

  // Note Touch Start
  const handleNoteTouchStart = useCallback(
    (e: React.TouchEvent, noteId: string) => {
      if (e.touches.length > 1) return;
      e.stopPropagation();

      const touch = e.touches[0];
      const now = Date.now();

      let newSelection: Set<string>;
      const currentSelected = selectedNoteIdsRef.current;
      if (currentSelected.has(noteId)) {
        newSelection = new Set(currentSelected);
      } else {
        newSelection = new Set([noteId]);
      }

      onSelectNotes(newSelection);
      onSelectCards(new Set());
      selectedNoteIdsRef.current = newSelection;
      selectedCardIdsRef.current = new Set();

      draggedNoteIdsRef.current = new Set(newSelection);
      isDraggingNotesRef.current = true;

      touchStateRef.current = {
        mode: 'drag-note',
        lastPos: { x: touch.clientX, y: touch.clientY },
        startPos: { x: touch.clientX, y: touch.clientY },
        initialPinchDist: 0,
        initialPinchZoom: zoomRef.current,
        pinchCenter: { x: touch.clientX, y: touch.clientY },
        noteId,
        lastTapTime: now,
      };
      lastMousePos.current = { x: touch.clientX, y: touch.clientY };
    },
    [onSelectNotes, onSelectCards]
  );

  // Canvas Touch Start
  const handleCanvasTouchStart = (e: React.TouchEvent) => {
    if (contextMenu.visible) {
      setContextMenu((prev) => ({ ...prev, visible: false }));
    }

    if (e.touches.length === 2) {
      // Pinch to Zoom start
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const centerX = (t1.clientX + t2.clientX) / 2;
      const centerY = (t1.clientY + t2.clientY) / 2;

      touchStateRef.current = {
        mode: 'pinch',
        lastPos: { x: centerX, y: centerY },
        startPos: { x: centerX, y: centerY },
        initialPinchDist: dist || 1,
        initialPinchZoom: zoomRef.current,
        pinchCenter: { x: centerX, y: centerY },
      };
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const now = Date.now();
      const lastTap = touchStateRef.current.lastTapTime || 0;

      // Detect double tap on canvas background -> create note
      if (now - lastTap < 300) {
        const world = screenToCanvas(touch.clientX, touch.clientY);
        const newNote: Note = {
          id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          x: world.x,
          y: world.y,
          width: 180,
          height: 140,
          text: '',
          color: 'yellow',
          attachedTo: null,
        };
        onAddNote(newNote);
        onSelectNotes(new Set([newNote.id]));
        onSelectCards(new Set());
        selectedNoteIdsRef.current = new Set([newNote.id]);
        selectedCardIdsRef.current = new Set();
        touchStateRef.current.mode = 'idle';
        return;
      }

      // Single touch on canvas -> pan canvas
      isPanningRef.current = true;
      touchStateRef.current = {
        mode: 'pan',
        lastPos: { x: touch.clientX, y: touch.clientY },
        startPos: { x: touch.clientX, y: touch.clientY },
        initialPinchDist: 0,
        initialPinchZoom: zoomRef.current,
        pinchCenter: { x: touch.clientX, y: touch.clientY },
        lastTapTime: now,
      };

      if (!isConnectionMode) {
        onSelectCards(new Set());
        onSelectNotes(new Set());
        selectedCardIdsRef.current = new Set();
        selectedNoteIdsRef.current = new Set();
      }
    }
  };

  // Canvas Touch Move
  const handleCanvasTouchMove = (e: React.TouchEvent) => {
    // 2 touches: Pinch Zoom & Pan
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const currentCenterX = (t1.clientX + t2.clientX) / 2;
      const currentCenterY = (t1.clientY + t2.clientY) / 2;

      const { initialPinchDist, initialPinchZoom, pinchCenter } = touchStateRef.current;
      if (initialPinchDist > 0 && containerRef.current) {
        const scaleFactor = dist / initialPinchDist;
        const nextZoom = Math.max(0.1, Math.min(initialPinchZoom * scaleFactor, 4.0));

        const rect = containerRef.current.getBoundingClientRect();
        const focusX = pinchCenter.x - rect.left;
        const focusY = pinchCenter.y - rect.top;

        const panDx = currentCenterX - touchStateRef.current.lastPos.x;
        const panDy = currentCenterY - touchStateRef.current.lastPos.y;

        const curPan = panRef.current;
        const curZoom = zoomRef.current;
        const newPan = {
          x: focusX - (focusX - curPan.x) * (nextZoom / curZoom) + panDx,
          y: focusY - (focusY - curPan.y) * (nextZoom / curZoom) + panDy,
        };

        onUpdatePanZoom(newPan, nextZoom);
        touchStateRef.current.lastPos = { x: currentCenterX, y: currentCenterY };
      }
      return;
    }

    // 1 touch: Pan Canvas OR Drag Cards / Notes
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - touchStateRef.current.lastPos.x;
      const dy = touch.clientY - touchStateRef.current.lastPos.y;

      if (touchStateRef.current.mode === 'pan' || isPanningRef.current) {
        e.preventDefault();
        const curPan = panRef.current;
        const curZoom = zoomRef.current;
        onUpdatePanZoom({ x: curPan.x + dx, y: curPan.y + dy }, curZoom);
        touchStateRef.current.lastPos = { x: touch.clientX, y: touch.clientY };
        return;
      }

      if (touchStateRef.current.mode === 'drag-card' || isDraggingCardsRef.current) {
        e.preventDefault();
        const curZoom = zoomRef.current || 1;
        const worldDx = dx / curZoom;
        const worldDy = dy / curZoom;
        const activeIds = draggedCardIdsRef.current;

        const updatedCards = cardsRef.current.map((c) => {
          if (activeIds.has(c.id)) {
            return {
              ...c,
              x: Math.round(c.x + worldDx),
              y: Math.round(c.y + worldDy),
            };
          }
          return c;
        });

        cardsRef.current = updatedCards;
        onUpdateCards(updatedCards);

        let hasNotesChanged = false;
        const updatedNotes = notesRef.current.map((n) => {
          if (n.attachedTo && activeIds.has(n.attachedTo)) {
            hasNotesChanged = true;
            return {
              ...n,
              x: Math.round(n.x + worldDx),
              y: Math.round(n.y + worldDy),
            };
          }
          return n;
        });

        if (hasNotesChanged) {
          notesRef.current = updatedNotes;
          onUpdateNotes(updatedNotes);
        }

        touchStateRef.current.lastPos = { x: touch.clientX, y: touch.clientY };
        return;
      }

      if (touchStateRef.current.mode === 'drag-note' || isDraggingNotesRef.current) {
        e.preventDefault();
        const curZoom = zoomRef.current || 1;
        const worldDx = dx / curZoom;
        const worldDy = dy / curZoom;
        const activeIds = draggedNoteIdsRef.current;

        const updatedNotes = notesRef.current.map((n) => {
          if (activeIds.has(n.id)) {
            return {
              ...n,
              x: Math.round(n.x + worldDx),
              y: Math.round(n.y + worldDy),
            };
          }
          return n;
        });

        notesRef.current = updatedNotes;
        onUpdateNotes(updatedNotes);
        touchStateRef.current.lastPos = { x: touch.clientX, y: touch.clientY };
      }
    }
  };

  // Canvas Touch End / Cancel
  const handleCanvasTouchEnd = () => {
    if (touchStateRef.current.mode === 'drag-card' && onCardsDragEndRef.current) onCardsDragEndRef.current([...draggedCardIdsRef.current]);
    touchStateRef.current.mode = 'idle';
    isDraggingCardsRef.current = false;
    isDraggingNotesRef.current = false;
    isPanningRef.current = false;
    setIsDraggingCards(false);
    setIsDraggingNotes(false);
    setIsPanning(false);
  };

  // External Drag & Drop
  // Only real files or products from the library count as drops (not toolbar buttons being reordered)
  const isAcceptedDrag = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer?.types || []);
    return types.includes('Files') || types.includes(PRODUCT_DRAG_TYPE) || types.includes(SLOT_DRAG_TYPE);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!isAcceptedDrag(e)) return;
    e.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    // Products dragged from the library panel
    const productIds = e.dataTransfer.getData(PRODUCT_DRAG_TYPE);
    if (productIds && onDropProducts) {
      try {
        onDropProducts(JSON.parse(productIds), screenToCanvas(e.clientX, e.clientY));
      } catch {
        /* ignore */
      }
      return;
    }
    // One photo from a position cell
    const slotRef = e.dataTransfer.getData(SLOT_DRAG_TYPE);
    if (slotRef && onDropSlot) {
      try {
        onDropSlot(JSON.parse(slotRef), screenToCanvas(e.clientX, e.clientY));
      } catch {
        /* ignore */
      }
      return;
    }
    // A dropped folder: keep its structure (one group per subfolder), no crop queue
    const folderEntries = onAddFolder ? folderEntriesFromDrop(e.dataTransfer) : null;
    if (folderEntries && onAddFolder) {
      const dropPos = screenToCanvas(e.clientX, e.clientY);
      collectFolderFiles(folderEntries).then((files) => onAddFolder(files, dropPos));
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter((f: File) => isImageFile(f));
      if (files.length > 0) {
        const dropPos = screenToCanvas(e.clientX, e.clientY);
        onAddImages(files, dropPos);
      }
    }
  };

  const activeGroup = useMemo(() => {
    if (contextMenu.groupId) {
      return (project.groups || []).find((g) => g.id === contextMenu.groupId);
    }
    if (selectedCardIds.size > 0) {
      return (project.groups || []).find((g) =>
        g.children.some((cid) => selectedCardIds.has(cid))
      );
    }
    return undefined;
  }, [contextMenu.groupId, selectedCardIds, project.groups]);

  const marqueeStyle = marquee
    ? {
        left: Math.min(marquee.startX, marquee.currentX),
        top: Math.min(marquee.startY, marquee.currentY),
        width: Math.abs(marquee.currentX - marquee.startX),
        height: Math.abs(marquee.currentY - marquee.startY),
      }
    : null;

  const cardMap = useMemo(() => {
    const map = new Map<string, Card>();
    (project.cards || []).forEach((c) => map.set(c.id, c));
    return map;
  }, [project.cards]);

  return (
    <div
      ref={containerRef}
      id="main-canvas-container"
      tabIndex={0}
      style={{ touchAction: 'none' }}
      className={`relative flex-1 w-full h-full overflow-hidden bg-[var(--soft)] select-none outline-none ${
        isSpaceDown
          ? isPanning
            ? 'cursor-grabbing'
            : 'cursor-grab'
          : isConnectionMode
          ? 'cursor-crosshair'
          : 'cursor-default'
      }`}
      onMouseDown={handleCanvasMouseDown}
      onDoubleClick={handleCanvasDoubleClick}
      onContextMenu={handleContextMenu}
      onTouchStart={handleCanvasTouchStart}
      onTouchMove={handleCanvasTouchMove}
      onTouchEnd={handleCanvasTouchEnd}
      onTouchCancel={handleCanvasTouchEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Subtle Dot Grid Background */}
      <div
        id="canvas-grid-background"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(10, 10, 10, 0.16) 1px, transparent 0)',
          backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* World Plane Container */}
      <div
        id="canvas-world-plane"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          // Outlines stay 1 screen pixel at any zoom
          ['--canvas-zoom' as string]: zoom,
          transformOrigin: '0 0',
        }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* Site Mockup Background Layer */}
        {project.siteMockup && (
          <div
            id="canvas-site-mockup-layer"
            style={{
              transform: `translate3d(${project.siteMockup.x}px, ${project.siteMockup.y}px, 0)`,
              width: `${project.siteMockup.width || 960}px`,
              height: `${project.siteMockup.height || 640}px`,
              zIndex: 2,
            }}
            className="absolute top-0 left-0 bg-white overflow-hidden pointer-events-auto group/mockup select-none"
            onMouseDown={handleSiteMockupMouseDown}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ opacity: project.siteMockup.opacity ?? 0.5 }}
            >
              <img
                src={project.siteMockup.src}
                alt="Site Mockup"
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
              />
            </div>

            {/* Mockup head: one line of text over the mockup, on hover */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between bg-white px-1 h-6 text-[12px] opacity-0 group-hover/mockup:opacity-100 z-10">
              <span>Макет сайта</span>
              <span className="flex items-center">
                {[0.2, 0.5, 0.8, 1.0].map((op) => (
                  <button
                    key={op}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onChangeSiteMockupOpacity) onChangeSiteMockupOpacity(op);
                    }}
                    className={`px-1 cursor-pointer ${
                      Math.abs((project.siteMockup?.opacity ?? 0.5) - op) < 0.05 ? 'bg-[var(--fg)] text-white' : 'hover:bg-[var(--soft)]'
                    }`}
                  >
                    {Math.round(op * 100)}%
                  </button>
                ))}
                {onDeleteSiteMockup && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSiteMockup();
                    }}
                    className="ml-2 px-1 hover:bg-[var(--marker)] cursor-pointer"
                    title="Убрать макет"
                  >
                    убрать
                  </button>
                )}
              </span>
            </div>

            {/* Resize Handle at bottom right */}
            <div
              className="absolute bottom-0 right-0 w-4 h-4 bg-[var(--fg)] cursor-nwse-resize z-10"
              onMouseDown={handleSiteMockupResizeMouseDown}
              title="Изменить размер макета"
            />
          </div>
        )}

        {/* «Оси»: grids under the photos */}
        {matrixApi &&
          (project.matrices || []).map((m) => (
            <BoardMatrixView key={m.id} matrix={m} cards={project.cards || []} zoom={zoom} api={matrixApi} dimmed={Boolean(focusGroupId)} />
          ))}

        {/* Render Groups */}
        {project.groups?.map((group) => {
          const memberCards = (project.cards || []).filter((c) =>
            group.children.includes(c.id)
          );
          if (memberCards.length === 0) return null;

          const minX = Math.min(...memberCards.map((c) => c.x)) - 16;
          const minY = Math.min(...memberCards.map((c) => c.y)) - 38;
          const maxX = Math.max(...memberCards.map((c) => c.x + c.width)) + 16;
          const maxY = Math.max(...memberCards.map((c) => c.y + (c.height || 300))) + 16;
          const w = maxX - minX;
          const h = maxY - minY;

          return (
            <div
              key={group.id}
              id={`group-box-${group.id}`}
              style={{
                transform: `translate3d(${minX}px, ${minY}px, 0)`,
                width: `${w}px`,
                height: `${h}px`,
                zIndex: 4,
                opacity: focusGroupId && focusGroupId !== group.id ? 0.15 : 1,
                backgroundColor: `${group.color || '#0a0a0a'}12`,
              }}
              className="absolute pointer-events-auto cursor-grab active:cursor-grabbing group/grp select-none"
              onMouseDown={(e) => handleGroupMouseDown(e, group)}
            >
              <div className="absolute top-1 left-1 flex items-baseline gap-1.5 text-[12px] leading-4 select-none whitespace-nowrap">
                <span className="w-2 h-2 self-center" style={{ backgroundColor: group.color || '#0a0a0a' }} />
                <GroupName name={group.name || 'Группа'} onRename={onRenameGroup ? (n) => onRenameGroup(group.id, n) : undefined} />
                <span className="text-[var(--grey)] tabular-nums">{memberCards.length}</span>
                <span
                  className={`flex gap-2 ${
                    group.children.some((cid) => selectedCardIds.has(cid)) || focusGroupId === group.id ? '' : 'opacity-0 group-hover/grp:opacity-100'
                  }`}
                >
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (focusGroupId === group.id) setFocusGroupId(null);
                      else enterFocus(group.id);
                    }}
                    className="text-[var(--grey)] hover:text-[var(--fg)] underline cursor-pointer"
                    title="Приблизить группу и приглушить остальное (Esc — выйти)"
                  >
                    {focusGroupId === group.id ? 'выйти из фокуса' : 'фокус'}
                  </button>
                  {onGroupToPosition && (
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onGroupToPosition(group.id);
                      }}
                      className="text-[var(--grey)] hover:text-[var(--fg)] underline cursor-pointer"
                      title="Вся группа станет одной позицией: первое фото — исходник, остальные — ракурсы"
                    >
                      в позицию
                    </button>
                  )}
                  {onUngroup && (
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUngroup(group.id);
                      }}
                      className="text-[var(--grey)] hover:text-[var(--fg)] underline cursor-pointer"
                      title="Разгруппировать (⇧⌘G)"
                    >
                      разгруппировать
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}

        {/* Connections SVG Layer */}
        <svg
          className="absolute inset-0 pointer-events-none overflow-visible"
          style={{ width: 1, height: 1, zIndex: 12 }}
        >
          <defs>
            <marker
              id="conn-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0a0a0a" />
            </marker>
            <marker
              id="conn-arrow-selected"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0a0a0a" />
            </marker>
          </defs>

          {project.connections?.map((conn) => {
            const cardFrom = cardMap.get(conn.from);
            const cardTo = cardMap.get(conn.to);
            if (!cardFrom || !cardTo) return null;

            const x1 = cardFrom.x + cardFrom.width / 2;
            const y1 = cardFrom.y + (cardFrom.height || 300) / 2;
            const x2 = cardTo.x + cardTo.width / 2;
            const y2 = cardTo.y + (cardTo.height || 300) / 2;

            const dx = x2 - x1;
            const dy = y2 - y1;
            const offset = Math.min(220, Math.max(60, Math.abs(dx) * 0.5));
            const cp1x = x1 + (dx >= 0 ? offset : -offset);
            const cp1y = y1;
            const cp2x = x2 - (dx >= 0 ? offset : -offset);
            const cp2y = y2;
            const d = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const isConnSelected = selectedConnectionId === conn.id;

            return (
              <g key={conn.id} className="group pointer-events-auto">
                <path
                  d={d}
                  stroke="transparent"
                  strokeWidth={24}
                  fill="none"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectConnection) onSelectConnection(conn.id);
                    onSelectCards(new Set());
                    onSelectNotes(new Set());
                  }}
                />

                {isConnSelected && (
                  <path
                    d={d}
                    stroke="#ffe500"
                    strokeWidth={8}
                    fill="none"
                    className="pointer-events-none opacity-80"
                  />
                )}

                <path
                  d={d}
                  stroke={conn.auto ? '#8a8a87' : '#0a0a0a'}
                  strokeWidth={conn.auto ? 1 : 1.5}
                  strokeDasharray={conn.auto ? '2,4' : undefined}
                  fill="none"
                  markerEnd={isConnSelected ? 'url(#conn-arrow-selected)' : 'url(#conn-arrow)'}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectConnection) onSelectConnection(conn.id);
                    onSelectCards(new Set());
                    onSelectNotes(new Set());
                  }}
                />

                <circle cx={x1} cy={y1} r={2.5} fill="#0a0a0a" />
                <circle cx={x2} cy={y2} r={2.5} fill="#0a0a0a" />

                <g
                  transform={`translate(${midX}, ${midY})`}
                  className={`cursor-pointer transition-opacity ${
                    isConnSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onDeleteConnection) onDeleteConnection(conn.id);
                    if (onSelectConnection) onSelectConnection(null);
                  }}
                >
                  <rect x={-26} y={-9} width={52} height={18} fill="#ffffff" />
                  <text textAnchor="middle" dy="4" fill="#0a0a0a" fontSize="11">
                    удалить
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {/* Render Cards */}
        {project.cards?.map((card) => (
          <CardItem
            key={card.id}
            card={card}
            isSelected={selectedCardIds.has(card.id)}
            isSoleSelected={selectedCardIds.size === 1 && selectedCardIds.has(card.id)}
            onMakeExample={onMakeExample && card.meta?.masterPromptName && examplePromptNames?.has(card.meta.masterPromptName) ? onMakeExample : undefined}
            onCut={onCutCard}
            dimmed={Boolean(focusGroupId) && !focusIds.has(card.id)}
            isConnectingSource={connectingSourceCardId === card.id}
            isConnectionMode={isConnectionMode}
            onMouseDown={handleCardMouseDown}
            onTouchStart={handleCardTouchStart}
            onDelete={onDeleteCard}
            onDuplicate={onDuplicateCard}
            onPreview={onPreviewCard}
            onChangeTakes={onChangeCardTakes}
            editTakes={selectedCardIds.size === 1 && selectedCardIds.has(card.id)}
            onEdit={onEditCard}
            quickEdits={quickEditPrompts}
            isGenerating={isGenerating}
          />
        ))}

        {/* Render Sticky Notes */}
        {project.notes?.map((note) => {
          const attachedCard = note.attachedTo ? cardMap.get(note.attachedTo) : undefined;
          return (
            <NoteItem
              key={note.id}
              note={note}
              isSelected={selectedNoteIds.has(note.id)}
              dimmed={Boolean(focusGroupId) && !(note.attachedTo && focusIds.has(note.attachedTo))}
              isAttached={Boolean(note.attachedTo && attachedCard)}
              attachedCardName={attachedCard?.name || 'Карточка'}
              onMouseDown={handleNoteMouseDown}
              onTouchStart={handleNoteTouchStart}
              onUpdateText={onUpdateNoteText}
              onUpdateColor={onUpdateNoteColor}
              onUpdateSize={onUpdateNoteSize}
              onDelete={onDeleteNote}
              onDetach={onDetachNote}
            />
          );
        })}
      </div>

      {/* Context Menu Popup */}
      {contextMenu.visible && (
        <div
          id="canvas-context-menu"
          style={{
            left: `${Math.max(8, Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1440) - 290))}px`,
            top: `${Math.max(8, Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 900) - 260))}px`,
          }}
          className="fixed z-50 bg-white min-w-[200px] text-[13px] text-[var(--fg)] ofst-pop whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {onImportFolder && (
            <>
              <button
                onClick={() => {
                  onImportFolder('products');
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="w-full px-2 h-7 text-left hover:bg-[var(--soft)] flex items-center cursor-pointer"
              >
                <span>Импорт продуктов (папка)</span>
              </button>
              <button
                onClick={() => {
                  onImportFolder('board');
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="w-full px-2 h-7 text-left hover:bg-[var(--soft)] flex items-center cursor-pointer"
              >
                <span>Папка фото на доску</span>
              </button>
            </>
          )}
          {onAddMatrix && (
            <button
              onClick={() => {
                onAddMatrix(screenToCanvas(contextMenu.x, contextMenu.y));
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
              className="w-full px-2 h-7 text-left hover:bg-[var(--soft)] flex items-center cursor-pointer"
              title="Сетка: строки — товары, столбцы — ракурсы. Фото, брошенные в клетку, встают ровно"
            >
              <span>Оси здесь (товары × ракурсы)</span>
            </button>
          )}
          {selectedCardIds.size > 1 && onGroupSelected && (
            <button
              onClick={() => {
                onGroupSelected();
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
              className="w-full px-2 h-7 text-left hover:bg-[var(--soft)] flex items-center cursor-pointer"
            >
              <span>Сгруппировать ({selectedCardIds.size})</span>
            </button>
          )}

          {activeGroup && onUngroup && (
            <button
              onClick={() => {
                onUngroup(activeGroup.id);
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
              className="w-full px-2 h-7 text-left hover:bg-[var(--soft)] flex items-center cursor-pointer"
            >
              <span>Разгруппировать</span>
            </button>
          )}

          {selectedCardIds.size > 0 && onAnalyzeStyle && (
            <button
              onClick={() => {
                onAnalyzeStyle();
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
              className="w-full px-2 h-7 text-left hover:bg-[var(--soft)] flex items-center cursor-pointer"
            >
              <span>Описать стиль выделенных</span>
            </button>
          )}

          {contextMenu.isMockup && (
            <>
              <div className="px-2 pt-1 text-[12px] text-[var(--grey)]">Макет сайта, прозрачность</div>
              <div className="px-2 pb-1">
                <div className="flex">
                  {[0.2, 0.5, 0.8, 1.0].map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => {
                        if (onChangeSiteMockupOpacity) onChangeSiteMockupOpacity(op);
                        setContextMenu((prev) => ({ ...prev, visible: false }));
                      }}
                      className={`ofst-cell !h-6 ${Math.abs((project.siteMockup?.opacity ?? 0.5) - op) < 0.05 ? 'is-on' : ''}`}
                    >
                      {Math.round(op * 100)}%
                    </button>
                  ))}
                </div>
              </div>

              {onDeleteSiteMockup && (
                <button
                  onClick={() => {
                    onDeleteSiteMockup();
                    setContextMenu((prev) => ({ ...prev, visible: false }));
                  }}
                  className="w-full px-2 h-7 text-left hover:bg-[var(--marker)] flex items-center cursor-pointer"
                >
                      <span>Убрать макет</span>
                </button>
              )}
            </>
          )}

          {contextMenu.cardId && (
            <>
              <button
                onClick={() => {
                  const card = (project.cards || []).find((c) => c.id === contextMenu.cardId);
                  if (card) onDuplicateCard(card);
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="w-full px-2 h-7 text-left hover:bg-[var(--soft)] flex items-center cursor-pointer"
              >
                  <span>Копия</span>
              </button>

              <button
                onClick={() => {
                  if (contextMenu.cardId) onDeleteCard(contextMenu.cardId);
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="w-full px-2 h-7 text-left hover:bg-[var(--marker)] flex items-center cursor-pointer"
              >
                  <span>Удалить</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Connection Mode Active Helper Banner */}
      {isConnectionMode && (
        <div className="absolute top-0 inset-x-0 z-40 bg-[var(--marker)] px-2 h-7 flex items-center justify-between text-[13px]">
          <span>
            {connectingSourceCardId
              ? 'Связи: теперь кликни второе фото'
              : 'Связи: кликни первое фото'}
          </span>
          <button
            onClick={() => {
              if (connectingSourceCardId && onSetConnectingSourceCardId) {
                onSetConnectingSourceCardId(null);
              }
              if (onToggleConnectionMode) {
                onToggleConnectionMode();
              }
            }}
            className="underline cursor-pointer"
            title="Выйти из режима связей (Esc)"
          >
            готово
          </button>
        </div>
      )}

      {/* Marquee Selection Rectangle */}
      {marqueeStyle && marqueeStyle.width > 2 && marqueeStyle.height > 2 && (
        <div
          id="canvas-selection-box"
          style={{
            left: `${marqueeStyle.left}px`,
            top: `${marqueeStyle.top}px`,
            width: `${marqueeStyle.width}px`,
            height: `${marqueeStyle.height}px`,
          }}
          className="absolute border border-[var(--fg)] bg-[var(--marker)]/10 pointer-events-none z-40"
        />
      )}

      {/* Drop Target Glow Overlay */}
      {isDragOver && (
        <div
          id="canvas-dropzone-overlay"
          className="absolute inset-0 ofst-outline bg-white/60 flex items-center justify-center z-50 pointer-events-none"
        >
          <p className="text-[clamp(28px,3.6vw,56px)] font-medium leading-none tracking-[-.025em]">Отпусти — фото встанут сюда</p>
        </div>
      )}

      {/* Empty board: plain text, like a catalogue page before the objects */}
      {(!project.cards || project.cards.length === 0) &&
        (!project.notes || project.notes.length === 0) && (
          <div id="canvas-empty-state" className="absolute inset-x-0 top-0 p-2 pointer-events-none">
            <div className="ofst-run max-w-[1100px]">
              <span>{project.name}</span>
              <span>пустая доска</span>
            </div>
            <p className="mt-3 max-w-[18ch] text-[var(--fg)] text-[clamp(30px,3.6vw,56px)] font-medium leading-none tracking-[-.025em]">
              Перетащи сюда фото или папку
            </p>
            <div className="mt-4 pointer-events-auto">
              <EmptyAddButton
                onFiles={() => document.getElementById('hidden-global-file-input')?.click()}
                onFolder={onImportFolder ? () => onImportFolder('ask') : undefined}
              />
            </div>
            <p className="mt-3 max-w-[52ch] text-[13px] text-[var(--grey)]">
              Картинку из интернета можно скопировать и вставить сюда: ⌘V / Ctrl+V. Папку студия спросит: это продукты (уйдут в позиции) или фото на доску. Каждая подпапка станет своей группой.
            </p>
          </div>
        )}

      {/* Hints: one grey line, no box */}
      <p className="absolute bottom-2 left-2 hidden lg:flex gap-4 text-[11px] text-[var(--grey)] z-30 pointer-events-none">
        <span>⌘V — вставить фото</span>
        <span>Двойной клик — заметка</span>
        <span>Space — панорама</span>
        <span>Ctrl + колесо — зум</span>
      </p>

      {/* Floating Zoom Controller */}
      <ZoomControls
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onFitCards={handleFitCards}
      />
    </div>
  );
};

/** One button for photos and folders. The browser picker can't take both at once, so it opens a two-line choice. */
const EmptyAddButton: React.FC<{ onFiles: () => void; onFolder?: () => void }> = ({ onFiles, onFolder }) => {
  const [open, setOpen] = React.useState(false);
  if (!onFolder) {
    return <button className="ofst-cell ofst-cell--primary" onClick={onFiles}>Фото</button>;
  }
  return (
    <div className="relative inline-flex flex-col items-start">
      <button className="ofst-cell ofst-cell--primary" onClick={() => setOpen((v) => !v)}>Фото / папка</button>
      {open && (
        <div className="flex flex-col bg-white min-w-full ofst-pop">
          <button className="ofst-cell justify-start" onClick={() => { setOpen(false); onFiles(); }}>Фото</button>
          <button className="ofst-cell justify-start" onClick={() => { setOpen(false); onFolder(); }}>Папка</button>
        </div>
      )}
    </div>
  );
};

/** Group name on the board: double-click to rename, Enter to keep, Esc to cancel */
function GroupName({ name, onRename }: { name: string; onRename?: (name: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(name);
  React.useEffect(() => setText(name), [name]);
  if (!editing || !onRename) {
    return (
      <span
        onDoubleClick={(e) => {
          if (!onRename) return;
          e.stopPropagation();
          setEditing(true);
        }}
        className={onRename ? 'cursor-text' : ''}
        title={onRename ? 'Двойной клик — переименовать' : undefined}
      >
        {name}
      </span>
    );
  }
  const finish = (keep: boolean) => {
    setEditing(false);
    if (keep && text.trim() && text.trim() !== name) onRename(text.trim());
    else setText(name);
  };
  return (
    <input
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
      onFocus={(e) => e.target.select()}
      className="h-4 px-0.5 text-[12px] bg-white min-w-[120px] select-text"
      style={{ width: `${Math.max(12, text.length + 2)}ch` }}
    />
  );
}
