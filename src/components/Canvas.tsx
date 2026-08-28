import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardGroup, Connection, MarqueeBox, Note, NoteColor, Project, SiteMockup } from '../types';
import { CardItem } from './CardItem';
import { NoteItem } from './NoteItem';
import { ZoomControls } from './ZoomControls';
import {
  Layers,
  Sparkles,
  StickyNote,
  Link2,
  X,
  Ungroup,
  Palette,
  Copy,
  Trash2,
  Monitor,
} from 'lucide-react';

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

  // Wheel handler: Panning and Zooming with cursor focus
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
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
      const parentGroup = (project.groups || []).find((g) => g.children.includes(cardId));

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
          newSelection = new Set();
          if (parentGroup) {
            parentGroup.children.forEach((cid) => newSelection.add(cid));
          } else {
            newSelection.add(cardId);
          }
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

    const handleMouseUp = () => {
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
    touchStateRef.current.mode = 'idle';
    isDraggingCardsRef.current = false;
    isDraggingNotesRef.current = false;
    isPanningRef.current = false;
    setIsDraggingCards(false);
    setIsDraggingNotes(false);
    setIsPanning(false);
  };

  // External Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter((f: File) => f.type.startsWith('image/'));
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
      className={`relative flex-1 w-full h-full overflow-hidden bg-gray-50/50 select-none outline-none ${
        isSpaceDown
          ? isPanning
            ? 'cursor-grabbing'
            : 'cursor-grab'
          : isConnectionMode
          ? 'cursor-crosshair'
          : 'cursor-default'
      }`}
      onWheel={handleWheel}
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
            'radial-gradient(circle at 1px 1px, rgba(156, 163, 175, 0.28) 1.2px, transparent 0)',
          backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* World Plane Container */}
      <div
        id="canvas-world-plane"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
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
            className="absolute top-0 left-0 bg-white/90 border-2 border-teal-500/40 rounded-xl shadow-2xl overflow-hidden pointer-events-auto group/mockup select-none"
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

            {/* Mockup Toolbar Header */}
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between bg-teal-900/80 backdrop-blur-xs text-white px-2.5 py-1 rounded-lg text-xs opacity-0 group-hover/mockup:opacity-100 transition-opacity z-10">
              <div className="flex items-center gap-1.5 font-medium text-[11px]">
                <Monitor className="w-3.5 h-3.5 text-teal-300" />
                <span>Фоновый макет сайта</span>
              </div>

              <div className="flex items-center gap-1">
                {[0.2, 0.5, 0.8, 1.0].map((op) => (
                  <button
                    key={op}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onChangeSiteMockupOpacity) onChangeSiteMockupOpacity(op);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                      Math.abs((project.siteMockup?.opacity ?? 0.5) - op) < 0.05
                        ? 'bg-teal-500 text-white font-bold'
                        : 'text-white/80 hover:text-white'
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
                    className="ml-1 hover:bg-red-500/80 p-0.5 rounded text-white/80 hover:text-white transition-colors cursor-pointer"
                    title="Удалить фон сайта"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Resize Handle at bottom right */}
            <div
              className="absolute bottom-0 right-0 w-6 h-6 bg-teal-500/80 hover:bg-teal-600 cursor-nwse-resize rounded-tl-lg flex items-center justify-center text-white z-10"
              onMouseDown={handleSiteMockupResizeMouseDown}
              title="Изменить размер мокапа"
            >
              <svg className="w-3 h-3 pointer-events-none" viewBox="0 0 10 10">
                <path
                  d="M 8 2 L 2 8 M 8 5 L 5 8 M 8 8 L 8 8"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        )}

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
                backgroundColor: 'rgba(100, 100, 255, 0.08)',
              }}
              className="absolute rounded-2xl border-2 border-dashed border-indigo-400/80 pointer-events-auto transition-all hover:border-indigo-600 hover:bg-indigo-500/15 cursor-grab active:cursor-grabbing group/grp select-none shadow-xs"
              onMouseDown={(e) => handleGroupMouseDown(e, group)}
            >
              <div className="absolute -top-7 left-2 flex items-center gap-1.5 bg-indigo-600 text-white text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-sm select-none">
                <Layers className="w-3 h-3" />
                <span>{group.name || 'Группа'}</span>
                <span className="opacity-75 font-mono">({memberCards.length})</span>
                {onUngroup && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUngroup(group.id);
                    }}
                    className="ml-1 hover:bg-white/20 rounded-md p-0.5 transition-colors cursor-pointer"
                    title="Разгруппировать"
                  >
                    <Ungroup className="w-3 h-3" />
                  </button>
                )}
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
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
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
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
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
                    stroke="#fecaca"
                    strokeWidth={8}
                    fill="none"
                    className="pointer-events-none opacity-80"
                  />
                )}

                <path
                  d={d}
                  stroke={isConnSelected ? '#ef4444' : '#3b82f6'}
                  strokeWidth={isConnSelected ? 3 : 2.5}
                  strokeDasharray={isConnSelected ? '6,4' : undefined}
                  fill="none"
                  markerEnd={isConnSelected ? 'url(#conn-arrow-selected)' : 'url(#conn-arrow)'}
                  className="cursor-pointer transition-all hover:stroke-blue-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectConnection) onSelectConnection(conn.id);
                    onSelectCards(new Set());
                    onSelectNotes(new Set());
                  }}
                />

                <circle cx={x1} cy={y1} r={4.5} fill={isConnSelected ? '#ef4444' : '#2563eb'} />
                <circle cx={x2} cy={y2} r={4.5} fill={isConnSelected ? '#ef4444' : '#2563eb'} />

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
                  <circle r={10} fill="#ef4444" className="shadow-md hover:fill-red-600" />
                  <text textAnchor="middle" dy="3.5" fill="#ffffff" fontSize="10" fontWeight="bold">
                    ✕
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
            isConnectingSource={connectingSourceCardId === card.id}
            isConnectionMode={isConnectionMode}
            onMouseDown={handleCardMouseDown}
            onTouchStart={handleCardTouchStart}
            onDelete={onDeleteCard}
            onDuplicate={onDuplicateCard}
            onPreview={onPreviewCard}
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
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          className="fixed z-50 bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-gray-200 py-1.5 min-w-[190px] text-xs animate-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {selectedCardIds.size > 1 && onGroupSelected && (
            <button
              onClick={() => {
                onGroupSelected();
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
              className="w-full px-3 py-2 text-left text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 font-medium cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>Сгруппировать ({selectedCardIds.size})</span>
            </button>
          )}

          {activeGroup && onUngroup && (
            <button
              onClick={() => {
                onUngroup(activeGroup.id);
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
              className="w-full px-3 py-2 text-left text-gray-700 hover:bg-orange-50 hover:text-orange-700 flex items-center gap-2 font-medium cursor-pointer"
            >
              <Ungroup className="w-3.5 h-3.5 text-orange-600" />
              <span>Разгруппировать</span>
            </button>
          )}

          {selectedCardIds.size > 0 && onAnalyzeStyle && (
            <button
              onClick={() => {
                onAnalyzeStyle();
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
              className="w-full px-3 py-2 text-left text-gray-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2 font-medium cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5 text-purple-600" />
              <span>Анализировать стиль</span>
            </button>
          )}

          {contextMenu.isMockup && (
            <>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 border-b border-gray-100 flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-teal-600" />
                <span>Мокап сайта</span>
              </div>

              <div className="px-3 py-2 text-xs text-gray-700">
                <div className="text-[11px] font-medium text-gray-500 mb-1.5">Прозрачность фона:</div>
                <div className="grid grid-cols-4 gap-1">
                  {[0.2, 0.5, 0.8, 1.0].map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => {
                        if (onChangeSiteMockupOpacity) onChangeSiteMockupOpacity(op);
                        setContextMenu((prev) => ({ ...prev, visible: false }));
                      }}
                      className={`px-1.5 py-1 text-center rounded border text-xs font-medium cursor-pointer transition-colors ${
                        Math.abs((project.siteMockup?.opacity ?? 0.5) - op) < 0.05
                          ? 'bg-teal-50 border-teal-400 text-teal-700 font-bold'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
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
                  className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium cursor-pointer border-t border-gray-100 mt-1 pt-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить фон (мокап)</span>
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
                className="w-full px-3 py-2 text-left text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 font-medium cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-blue-600" />
                <span>Дублировать карточку</span>
              </button>

              <button
                onClick={() => {
                  if (contextMenu.cardId) onDeleteCard(contextMenu.cardId);
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium cursor-pointer border-t border-gray-100 mt-1 pt-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить карточку</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Connection Mode Active Helper Banner */}
      {isConnectionMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-blue-600/95 text-white px-4 py-2 rounded-full shadow-lg backdrop-blur-sm flex items-center gap-3 text-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 animate-pulse" />
            <span className="font-medium">
              {connectingSourceCardId
                ? 'Начальная карточка выбрана. Теперь кликните целевую карточку.'
                : 'Режим связей: кликните первую карточку для соединения'}
            </span>
          </div>
          <button
            onClick={() => {
              if (connectingSourceCardId && onSetConnectingSourceCardId) {
                onSetConnectingSourceCardId(null);
              }
              if (onToggleConnectionMode) {
                onToggleConnectionMode();
              }
            }}
            className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors cursor-pointer"
            title="Выйти из режима связей (Esc)"
          >
            <X className="w-3.5 h-3.5" />
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
          className="absolute border-2 border-blue-500/40 bg-blue-500/10 pointer-events-none rounded-sm z-40"
        >
          <div className="absolute bottom-1 right-2 text-blue-600 text-[10px] font-bold uppercase tracking-wider">
            Выделение
          </div>
        </div>
      )}

      {/* Drop Target Glow Overlay */}
      {isDragOver && (
        <div
          id="canvas-dropzone-overlay"
          className="absolute inset-4 rounded-2xl border-2 border-dashed border-blue-500 bg-blue-500/10 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 z-50 pointer-events-none transition-all"
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-600 border border-blue-400 flex items-center justify-center shadow-lg text-white">
            <Layers className="w-7 h-7 animate-bounce" />
          </div>
          <div className="text-center">
            <h3 className="text-base font-semibold text-gray-900">
              Отпустите изображения на канвас
            </h3>
            <p className="text-xs text-blue-600 mt-0.5 font-medium">
              Карточки создадутся в точке сброса
            </p>
          </div>
        </div>
      )}

      {/* Empty State Banner */}
      {(!project.cards || project.cards.length === 0) &&
        (!project.notes || project.notes.length === 0) && (
          <div
            id="canvas-empty-state"
            className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none"
          >
            <div className="max-w-md p-6 rounded-2xl bg-white/95 backdrop-blur-md border border-gray-200 shadow-xl space-y-3 pointer-events-auto">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto text-blue-600">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Канвас готов к работе
                </h2>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Перетащите фото товаров на канвас или нажмите кнопку <b>«+ Фото»</b> сверху.
                </p>
              </div>
              <div className="pt-1 flex justify-center gap-2">
                <button
                  onClick={() => {
                    const input = document.getElementById('hidden-global-file-input');
                    input?.click();
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm transition-colors cursor-pointer"
                >
                  Выбрать файлы
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Bottom Floating Toolbar: Hints (Desktop) */}
      <div className="absolute bottom-6 left-6 hidden lg:flex items-center gap-4 bg-white/80 backdrop-blur-sm border border-white/60 px-4 py-2 rounded-full shadow-sm text-[11px] text-gray-500 z-30 pointer-events-none">
        <span className="flex items-center">
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded shadow-sm text-gray-700 font-sans mr-1.5 text-[10px]">
            Двойной клик
          </kbd>{' '}
          Заметка
        </span>
        <span className="text-gray-300">•</span>
        <span className="flex items-center">
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded shadow-sm text-gray-700 font-sans mr-1.5 text-[10px]">
            Space
          </kbd>{' '}
          Панорама
        </span>
        <span className="text-gray-300">•</span>
        <span className="flex items-center">
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded shadow-sm text-gray-700 font-sans mr-1.5 text-[10px]">
            Ctrl + Колесо
          </kbd>{' '}
          Зум
        </span>
      </div>

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
