import React, { useState } from 'react';
import {
  FolderPlus,
  Folder,
  Trash2,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import { Project, StorageInfo } from '../types';

interface SidebarProps {
  projects: Project[];
  activeProjectId: string;
  storageInfo: StorageInfo;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
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
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
}) => {
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
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden animate-in fade-in duration-150"
        />
      )}

      <aside
        id="sidebar-projects"
        className={`bg-white border-r border-gray-200 flex flex-col shrink-0 select-none z-50 md:z-20 transition-transform duration-200 ease-in-out
          ${
            isMobileOpen
              ? 'fixed inset-y-0 left-0 w-[260px] translate-x-0 shadow-2xl md:relative md:w-[220px] md:shadow-none'
              : 'fixed inset-y-0 left-0 w-[260px] -translate-x-full md:relative md:w-[220px] md:translate-x-0'
          }`}
      >
        {/* Sidebar Header */}
        <div className="p-3 sm:p-4 border-b border-gray-100 flex items-center justify-between gap-2">
          <button
            id="btn-sidebar-new-project"
            onClick={onCreateProject}
            className="flex-1 py-2 bg-gray-900 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-gray-800 flex items-center justify-center gap-2 shadow-xs transition-colors"
            title="Создать новый проект"
          >
            <FolderPlus className="w-4 h-4" />
            <span>+ Новый проект</span>
          </button>

          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto py-2 sm:py-3 px-2 space-y-1 custom-scrollbar">
          <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Проекты
          </p>
          {projects.map((proj) => {
            const isActive = proj.id === activeProjectId;
            const isEditing = editingId === proj.id;

            if (isEditing) {
              return (
                <div
                  key={proj.id}
                  className="p-1.5 bg-gray-50 rounded-md border border-blue-400 flex items-center gap-1 shadow-xs"
                >
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(proj.id);
                      if (e.key === 'Escape') cancelRename();
                    }}
                    autoFocus
                    className="flex-1 bg-white text-xs text-gray-900 px-2 py-1 rounded border border-gray-200 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => saveRename(proj.id)}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={cancelRename}
                    className="p-1 text-gray-400 hover:bg-gray-200 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={proj.id}
                id={`project-item-${proj.id}`}
                onClick={() => handleSelect(proj.id)}
                className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium shadow-xs'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Folder
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-blue-600' : 'text-gray-400'
                    }`}
                  />
                  <span
                    className="truncate"
                    title={proj.name}
                    onDoubleClick={(e) => startRename(proj, e)}
                  >
                    {proj.name}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'bg-gray-100 text-gray-500 group-hover:text-gray-700'
                    }`}
                  >
                    {proj.cards?.length || 0}
                  </span>

                  <button
                    onClick={(e) => startRename(proj, e)}
                    className="opacity-0 group-hover:opacity-100 md:opacity-0 max-md:opacity-100 p-0.5 text-gray-400 hover:text-gray-700 rounded transition-opacity"
                    title="Переименовать"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProject(proj.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 md:opacity-0 max-md:opacity-100 p-0.5 text-gray-400 hover:text-red-500 rounded transition-opacity"
                    title="Удалить проект"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Storage Footer */}
        <div className="p-3 sm:p-4 border-t border-gray-100 bg-white">
          <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-[11px] font-semibold text-gray-700">Память</span>
              </div>
              <span className="font-mono text-[10px] text-gray-500">
                {storageInfo.percentage}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  storageInfo.percentage > 85
                    ? 'bg-red-500'
                    : storageInfo.percentage > 60
                    ? 'bg-amber-500'
                    : 'bg-blue-600'
                }`}
                style={{ width: `${Math.max(4, storageInfo.percentage)}%` }}
              />
            </div>
            <p className="text-[9px] text-gray-400 leading-tight">
              Локальное автосохранение
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};
