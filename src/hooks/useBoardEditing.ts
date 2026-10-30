/* eslint-disable react-hooks/exhaustive-deps */
// Board edits: links, deleting, duplicating, groups, notes that go into prompts, site mockup, export.
// Split out of App.tsx; App passes in what it needs and spreads back what it returns.
import React, { useCallback, useMemo } from 'react';
import { Card, CardGroup, Connection, Note, Project, SiteMockup } from '../types';
import { ConsideredNoteInfo } from '../components/GenerationPanel';
import { getDistanceBetweenRects } from '../studio/shared';

export interface BoardEditingDeps {
  activeProject: Project;
  activeProjectId: string;
  handleUpdateCards: (cards: Card[]) => void;
  handleUpdateNotes: (notes: Note[]) => void;
  projects: Project[];
  saveProjectsToStorage: (updatedProjects: Project[]) => void;
  selectedCardIds: Set<string>;
  selectedConnectionId: string;
  selectedNoteIds: Set<string>;
  setSelectedCardIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedConnectionId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  siteMockupInputRef: React.RefObject<HTMLInputElement>;
}

export function useBoardEditing(deps: BoardEditingDeps) {
  const {
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
  } = deps;

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

  return {
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
  };
}
