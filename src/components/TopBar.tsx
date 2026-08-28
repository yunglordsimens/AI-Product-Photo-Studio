import React from 'react';
import {
  Camera,
  Trash2,
  Download,
  Upload,
  Plus,
  FileCode,
  Sparkles,
  Settings,
  Menu,
  Zap,
  RotateCcw,
  HardDrive,
  BookOpen,
  Link2,
  Palette,
  Package,
  Layers,
  Monitor,
  ImageDown,
  SlidersHorizontal,
} from 'lucide-react';
import { StorageInfo } from '../types';

interface TopBarProps {
  projectName: string;
  cardCount: number;
  selectedCount: number;
  storageInfo: StorageInfo;
  onToggleSidebar?: () => void;
  onOpenRightDrawer?: () => void;
  onAddImage: () => void;
  onClearAll: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  onOpenExportModal: () => void;
  onOpenShortcuts: () => void;
  onGenerateSample: () => void;
  onOpenSettings: () => void;
  onToggleGeneration: () => void;
  isGenerationOpen: boolean;
  onOptimizeMemory: () => void;
  onClearMemory: () => void;
  isOptimizing?: boolean;
  onOpenMasterPrompts: () => void;
  isConnectionMode: boolean;
  onToggleConnectionMode: () => void;
  onAnalyzeStyle: () => void;
  isAnalyzingStyle?: boolean;
  onToggleProducts: () => void;
  isProductsOpen?: boolean;
  onGroupSelected?: () => void;
  canGroup?: boolean;
  onAddSiteMockup?: () => void;
  hasSiteMockup?: boolean;
  onExportImages?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  cardCount,
  selectedCount,
  storageInfo,
  onToggleSidebar,
  onOpenRightDrawer,
  onAddImage,
  onClearAll,
  onExportProject,
  onImportProject,
  onOpenExportModal,
  onOpenShortcuts,
  onGenerateSample,
  onOpenSettings,
  onToggleGeneration,
  isGenerationOpen,
  onOptimizeMemory,
  onClearMemory,
  isOptimizing = false,
  onOpenMasterPrompts,
  isConnectionMode,
  onToggleConnectionMode,
  onAnalyzeStyle,
  isAnalyzingStyle = false,
  onToggleProducts,
  isProductsOpen = false,
  onGroupSelected,
  canGroup = false,
  onAddSiteMockup,
  hasSiteMockup = false,
  onExportImages,
}) => {
  const isStorageHigh = storageInfo.percentage >= 80;
  const usedMb = (storageInfo.usedBytes / (1024 * 1024)).toFixed(1);

  return (
    <header
      id="app-topbar"
      className="h-14 bg-white border-b border-gray-200 px-2 sm:px-3 md:px-4 flex items-center justify-between select-none z-30 shrink-0 shadow-xs gap-1.5 sm:gap-2"
    >
      {/* Brand & Left Projects Menu */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
        {onToggleSidebar && (
          <button
            id="btn-toggle-sidebar"
            onClick={onToggleSidebar}
            className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors shrink-0"
            title="Список проектов"
            aria-label="Проекты"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-xs text-white font-bold text-sm shrink-0">
          <Camera className="w-4 h-4" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h1 className="font-semibold text-xs sm:text-sm md:text-base tracking-tight text-gray-900 truncate">
              <span className="hidden sm:inline">AI Photo Studio</span>
              <span className="sm:hidden truncate max-w-[90px]">{projectName}</span>
            </h1>
            <span className="hidden md:inline-block text-[10px] px-1.5 py-0.2 bg-gray-100 text-gray-600 border border-gray-200 rounded font-mono">
              v1.2
            </span>
          </div>
          <p className="hidden sm:block text-[10px] sm:text-[11px] text-gray-500 truncate max-w-[120px] md:max-w-xs">
            {projectName} • {cardCount} фото
            {selectedCount > 0 && (
              <span className="ml-1 text-blue-600 font-medium">({selectedCount})</span>
            )}
          </p>
        </div>
      </div>

      {/* Main Quick Action Buttons */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Add Photo Button (Always visible & primary) */}
        <button
          id="btn-add-photos"
          onClick={onAddImage}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-lg shadow-xs transition-all shrink-0 cursor-pointer"
          title="Загрузить фото (одно или несколько)"
        >
          <Plus className="w-4 h-4" />
          <span>Фото</span>
        </button>

        {/* AI Generation Quick Trigger */}
        <button
          id="btn-open-generation-panel"
          onClick={onToggleGeneration}
          className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 cursor-pointer ${
            isGenerationOpen
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200'
          }`}
          title="AI Генерация карточек (G)"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">AI (G)</span>
          <span className="sm:hidden">AI</span>
        </button>

        {/* Desktop-only Direct Tools */}
        <div className="hidden lg:flex items-center gap-1 sm:gap-1.5">
          {/* Style Analysis */}
          <button
            id="btn-analyze-style"
            onClick={onAnalyzeStyle}
            disabled={isAnalyzingStyle}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors shrink-0 cursor-pointer disabled:opacity-50"
            title="Анализ стиля выделенных фото"
          >
            <Palette className={`w-3.5 h-3.5 text-indigo-600 ${isAnalyzingStyle ? 'animate-spin' : ''}`} />
            <span className="hidden xl:inline">Стиль</span>
          </button>

          {/* Product Library */}
          <button
            id="btn-toggle-products-library"
            onClick={onToggleProducts}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors shrink-0 cursor-pointer ${
              isProductsOpen
                ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                : 'text-gray-700 hover:text-blue-700 bg-gray-50 hover:bg-blue-50 border-gray-200 hover:border-blue-200'
            }`}
            title="Библиотека продуктов"
          >
            <Package className="w-3.5 h-3.5 text-blue-500" />
            <span className="hidden xl:inline">Продукты</span>
          </button>

          {/* Master Prompts */}
          <button
            id="btn-topbar-master-prompts"
            onClick={onOpenMasterPrompts}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors shrink-0 cursor-pointer"
            title="Мастер-промпты"
          >
            <BookOpen className="w-3.5 h-3.5 text-purple-600" />
            <span className="hidden xl:inline">Промпты</span>
          </button>

          {/* Group */}
          {canGroup && onGroupSelected && (
            <button
              id="btn-group-selected-cards"
              onClick={onGroupSelected}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 rounded-lg transition-colors shrink-0"
              title="Сгруппировать выделенные карточки"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>Группа</span>
            </button>
          )}

          {/* Connection Mode */}
          <button
            id="btn-toggle-connection-mode"
            onClick={onToggleConnectionMode}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all shrink-0 cursor-pointer ${
              isConnectionMode
                ? 'bg-blue-600 text-white border-blue-700 shadow-xs ring-2 ring-blue-300'
                : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200'
            }`}
            title="Режим связей (L)"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Связи (L)</span>
          </button>
        </div>

        {/* Desktop-only Quick Right Actions */}
        <div className="hidden lg:flex items-center gap-1 sm:gap-1.5">
          {/* Storage widget */}
          <div
            id="topbar-storage-widget"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] bg-emerald-50/80 text-emerald-800 border-emerald-200"
            title={`Хранилище IndexedDB (безлимит): ${usedMb} MB`}
          >
            <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-medium">{usedMb} MB</span>
          </div>

          <button
            id="btn-topbar-settings"
            onClick={onOpenSettings}
            className="p-1.5 text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 rounded-lg border border-gray-300 shadow-xs transition-colors cursor-pointer"
            title="Настройки Gemini API"
          >
            <Settings className="w-4 h-4 text-gray-600" />
          </button>

          <button
            id="btn-top-export-json"
            onClick={onExportProject}
            className="p-1.5 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Скачать проект JSON"
          >
            <Download className="w-4 h-4 text-gray-600" />
          </button>

          <button
            id="btn-top-import-json"
            onClick={onImportProject}
            className="p-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Загрузить проект JSON"
          >
            <Upload className="w-4 h-4 text-gray-700" />
          </button>
        </div>

        {/* Mobile & Tablet Right Drawer Menu Trigger (Sliders / Menu with other actions) */}
        {onOpenRightDrawer && (
          <button
            id="btn-open-right-actions-drawer"
            onClick={onOpenRightDrawer}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Все инструменты и настройки"
            aria-label="Меню инструментов"
          >
            <SlidersHorizontal className="w-4 h-4 text-gray-700" />
            <span className="hidden sm:inline">Меню</span>
          </button>
        )}
      </div>
    </header>
  );
};
