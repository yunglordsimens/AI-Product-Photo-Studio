import React, { useState } from 'react';
import { Project, StorageInfo } from '../types';

interface SidebarProps {
  projects: Project[];
  activeProjectId: string;
  storageInfo: StorageInfo;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  /** Desktop: the column folds to zero width */
  isCollapsed?: boolean;
  onCollapse?: () => void;
  /** Desktop width in px; the right edge can be dragged */
  width?: number;
  onResize?: (width: number) => void;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  projects,
  activeProjectId,
  storageInfo,
  isMobileOpen = false,
  onCloseMobile,
  isCollapsed = false,
  onCollapse,
  width = 180,
  onResize,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
}) => {
  const [resizing, setResizing] = useState(false);
  const startResize = (e: React.PointerEvent) => {
    if (!onResize) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    setResizing(true);
    const move = (ev: PointerEvent) => onResize(Math.round(Math.min(360, Math.max(140, startW + ev.clientX - startX))));
    const up = () => {
      setResizing(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempName, setTempName] = useState<string>('');

  const startRename = (p: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(p.id);
    setTempName(p.name);
  };

  const saveRename = (id: string) => {
    if (tempName.trim()) {
      onRenameProject(id, tempName.trim());
    }
    setEditingId(null);
  };

  const cancelRename = () => {
    setEditingId(null);
  };

  const handleSelect = (id: string) => {
    onSelectProject(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <>
      {isMobileOpen && <div onClick={onCloseMobile} className="fixed inset-0 bg-black/30 z-40 md:hidden" />}

      <aside
        id="sidebar-projects"
        style={{ ['--sb-w' as string]: `${width}px`, transition: resizing ? 'none' : undefined }}
        className={`ofst-sidebar bg-white shrink-0 select-none z-50 md:z-20 overflow-hidden fixed inset-y-0 left-0 w-[240px] md:relative md:translate-x-0 ${
          isCollapsed ? 'md:w-0' : 'md:w-[var(--sb-w)]'
        } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Fixed-width inner column, so nothing reflows while the sidebar folds */}
        <div className="flex flex-col h-full w-[240px] md:w-[var(--sb-w)]">
        <div className="px-2 pt-2">
          <div className="ofst-run">
            <span>Проекты</span>
            <span className="flex gap-3">
              <span>{projects.length}</span>
              {onCollapse && (
                <button onClick={onCollapse} className="hidden md:inline hover:text-[var(--fg)] cursor-pointer" title="Скрыть колонку проектов">
                  скрыть
                </button>
              )}
            </span>
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto px-2 pt-1 custom-scrollbar">
          {projects.map((proj) => {
            const isActive = proj.id === activeProjectId;
            if (editingId === proj.id) {
              return (
                <li key={proj.id} className="py-0.5">
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onBlur={() => saveRename(proj.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(proj.id);
                      if (e.key === 'Escape') cancelRename();
                    }}
                    autoFocus
                    className="w-full h-7 px-1.5 text-[13px] focus:outline-none"
                  />
                </li>
              );
            }
            return (
              <li
                key={proj.id}
                id={`project-item-${proj.id}`}
                onClick={() => handleSelect(proj.id)}
                onDoubleClick={(e) => startRename(proj, e)}
                className={`group flex items-center gap-2 h-7 px-1.5 -mx-1.5 text-[13px] cursor-pointer ${
                  isActive ? 'bg-[var(--fg)] text-white' : 'hover:bg-[var(--soft)]'
                }`}
                title="Двойной клик — переименовать"
              >
                <span className="truncate flex-1">{proj.name}</span>
                <button
                  onClick={(e) => startRename(proj, e)}
                  className="hidden group-hover:block max-md:block text-[11px] opacity-60 hover:opacity-100"
                  title="Переименовать"
                >
                  имя
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProject(proj.id);
                  }}
                  className="hidden group-hover:block max-md:block text-[11px] opacity-60 hover:opacity-100"
                  title="Удалить проект"
                >
                  удалить
                </button>
                <span className={`text-[11px] tabular-nums ${isActive ? 'text-white/70' : 'text-[var(--grey)]'}`}>
                  {proj.cards?.length || 0}
                </span>
              </li>
            );
          })}
          <li>
            <button
              id="btn-sidebar-new-project"
              onClick={onCreateProject}
              className="ofst-cell justify-start w-[calc(100%+12px)] -mx-1.5 px-1.5 text-[var(--grey)] hover:text-[var(--fg)]"
              title="Создать новый проект"
            >
              + Новый проект
            </button>
          </li>
        </ul>

        <div
          className="px-2 pb-2 text-[11px] leading-snug text-[var(--grey)]"
          title="Все проекты, фото и мастер-промпты лежат в памяти этого браузера (IndexedDB)"
        >
          <div className="flex justify-between text-[var(--fg)]">
            <span>В этом браузере</span>
            <span className="tabular-nums">{(storageInfo.usedBytes / (1024 * 1024)).toFixed(1)} MB</span>
          </div>
          <p className="mt-0.5">
            Хранится только по адресу {typeof window !== 'undefined' ? window.location.hostname : ''}, не в облаке. Для копии —
            «Скачать».
          </p>
          {onCloseMobile && (
            <button onClick={onCloseMobile} className="ofst-cell md:hidden mt-1 -mx-2">
              Закрыть
            </button>
          )}
        </div>
        </div>
        {onResize && !isCollapsed && (
          <div onPointerDown={startResize} className="ofst-dock-handle ofst-dock-handle--right hidden md:block" title="Потяни, чтобы сделать шире или уже" />
        )}
      </aside>
    </>
  );
};
