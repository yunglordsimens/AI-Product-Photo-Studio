/* eslint-disable react-hooks/exhaustive-deps */
// Tabs, the right dock (products / AI / menu), the projects column and hidden top-bar tools.
// Split out of App.tsx; App passes in what it needs and spreads back what it returns.
import React, { useEffect, useCallback, useRef } from 'react';
import { StudioView } from '../components/TopBar';
import { DockId } from '../studio/shared';

export interface StudioLayoutDeps {
  dockOrder: DockId[];
  isGenerationOpen: boolean;
  isProductLibraryOpen: boolean;
  isRightDrawerOpen: boolean;
  setDockOrder: React.Dispatch<React.SetStateAction<DockId[]>>;
  setDockWidths: React.Dispatch<React.SetStateAction<Record<DockId, number>>>;
  setHiddenTools: React.Dispatch<React.SetStateAction<string[]>>;
  setIsGenerationOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMasterPromptsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMobileSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsProductLibraryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRightDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setIsStyleAnalysisOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  setStudioViewState: React.Dispatch<React.SetStateAction<StudioView>>;
}

export function useStudioLayout(deps: StudioLayoutDeps) {
  const {
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
  } = deps;

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
  // Hidden file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const siteMockupInputRef = useRef<HTMLInputElement>(null);
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
  const resizeDock = useCallback((id: DockId, w: number) => {
    setDockWidths((prev) => {
      const next = { ...prev, [id]: w };
      try {
        localStorage.setItem('aips_dock_widths', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
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
  const toggleTool = useCallback((id: string) => {
    setHiddenTools((prev) => {
      const next = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      try {
        localStorage.setItem('aips_hidden_tools', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return {
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
  };
}
