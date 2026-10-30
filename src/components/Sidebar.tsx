import { Info } from './Info';
import { CloudStatusLine, useCloud } from './CloudUI';
import React, { useState } from 'react';
import { Project, StorageInfo } from '../types';

interface SidebarProps {
  projects: Project[];
  activeProjectId: string;
  storageInfo: StorageInfo;
  /** Opens the settings window with the cloud section */
  onOpenCloud?: () => void;
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
  onOpenCloud,
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
  const cloud = useCloud();
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
            <span className="flex items-center gap-1.5">
              Проекты
              <Info>
                Каждый проект — своя доска, свои позиции и свой каталог. Справа у проекта — сколько фото на его доске. Двойной клик по
                названию — переименовать.
              </Info>
            </span>
            <span className="flex items-center gap-2">
              <span title={`Проектов: ${projects.length}`}>{projects.length}</span>
              {onCollapse && (
                <button onClick={onCollapse} className="ofst-x hidden md:inline-flex" title="Скрыть колонку проектов" aria-label="Скрыть колонку проектов">
                  ×
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
                    className="w-full h-7 px-2 text-[13px] focus:outline-none"
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
                className={`group flex items-center gap-2 h-7 px-2 text-[13px] cursor-pointer ${
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
                <span
                  className={`min-w-[22px] h-4 px-1 inline-flex items-center justify-center text-[11px] tabular-nums ${
                    isActive ? 'bg-white/15 text-white' : 'bg-[var(--soft)] text-[var(--grey)]'
                  }`}
                  title={`${proj.cards?.length || 0} фото на доске`}
                >
                  {proj.cards?.length || 0}
                </span>
              </li>
            );
          })}
          <li>
            <button
              id="btn-sidebar-new-project"
              onClick={onCreateProject}
              className="ofst-cell justify-start w-full px-2 text-[var(--grey)] hover:text-[var(--fg)]"
              title="Создать новый проект"
            >
              + Новый проект
            </button>
          </li>
        </ul>

        <div
          className="px-2 pb-2 text-[11px] leading-snug text-[var(--grey)]"
          title={cloud.enabled ? 'Копия в браузере, основное хранилище — облако студии' : 'Все проекты, фото и мастер-промпты лежат в памяти этого браузера (IndexedDB)'}
        >
          <div className="flex justify-between text-[var(--fg)]">
            <span>В этом браузере</span>
            <span className="tabular-nums">{(storageInfo.usedBytes / (1024 * 1024)).toFixed(1)} MB</span>
          </div>
          <div className="mt-0.5">
            <CloudStatusLine onOpen={() => onOpenCloud?.()} />
          </div>
          {!cloud.enabled && (
            <p className="mt-0.5">
              Сейчас хранится только по адресу {typeof window !== 'undefined' ? window.location.hostname : ''}.
            </p>
          )}
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
