/* eslint-disable react-hooks/exhaustive-deps */
// Loading from IndexedDB, saving with undo, projects, notes and the small board toggles.
// Split out of App.tsx; App passes in what it needs and spreads back what it returns.
import React, { useEffect, useCallback, useRef } from 'react';
import { Card, MasterPrompt, Note, NoteColor, ProductItem, Project, StorageInfo } from '../types';
import { loadProjects, loadProjectsAsync, saveProjects, getActiveProjectId, setActiveProjectId, getStorageUsage, getStorageUsageAsync, loadMasterPrompts, loadMasterPromptsAsync, saveMasterPrompts, requestPersistentStorage } from '../utils/storage';
import { type UndoEntry } from './useUndo';

export interface ProjectDataDeps {
  activeProjectId: string;
  masterPrompts: MasterPrompt[];
  productsList: ProductItem[];
  projects: Project[];
  setActiveProjectIdState: React.Dispatch<React.SetStateAction<string>>;
  setConnectingSourceCardId: React.Dispatch<React.SetStateAction<string>>;
  setIsConnectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIsExportModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGenerationOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsHydrated: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMasterPromptsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsProductLibraryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRightDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsStyleAnalysisOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMasterPrompts: React.Dispatch<React.SetStateAction<MasterPrompt[]>>;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  setSelectedCardIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedConnectionId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setStorageInfo: React.Dispatch<React.SetStateAction<StorageInfo>>;
  undo: { record: (entry: UndoEntry) => void; step: (direction: "undo" | "redo", swap: (entry: UndoEntry) => unknown | undefined) => boolean; canUndo: () => boolean; canRedo: () => boolean; };
}

export function useProjectData(deps: ProjectDataDeps) {
  const {
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
  } = deps;

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
  const masterPromptsRef = useRef<MasterPrompt[]>([]);
  masterPromptsRef.current = masterPrompts;
  const handleSaveMasterPrompts = useCallback((prompts: MasterPrompt[]) => {
    masterPromptsRef.current = prompts;
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
  const latestProjectsRef = useRef(projects);
  latestProjectsRef.current = projects;
  const latestProductsRef = useRef(productsList);
  latestProductsRef.current = productsList;
  const saveProjectsToStorage = useCallback((updatedProjects: Project[]) => {
    undo.record({ kind: 'board', state: latestProjectsRef.current });
    // Async work (parallel generations, cutting) reads this ref: keep it current before the next render
    latestProjectsRef.current = updatedProjects;
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

  return {
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
  };
}
