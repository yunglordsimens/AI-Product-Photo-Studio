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
  AlertTriangle,
  HardDrive,
  BookOpen,
  Link2,
  Palette,
  Package,
  Layers,
  Ungroup,
  Monitor,
  ImageDown,
} from 'lucide-react';
import { StorageInfo } from '../types';

interface TopBarProps {
  projectName: string;
  cardCount: number;
  selectedCount: number;
  storageInfo: StorageInfo;
  onToggleSidebar?: () => void;
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
      {/* Brand & Mobile Hamburger */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        {onToggleSidebar && (
          <button
            id="btn-toggle-sidebar"
            onClick={onToggleSidebar}
            className="md:hidden p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
            title="Список проектов"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-xs text-white font-bold text-sm shrink-0">
          <Camera className="w-4 h-4" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="font-semibold text-sm sm:text-base tracking-tight text-gray-900 truncate">
              <span className="hidden lg:inline">AI Product Photo Studio</span>
              <span className="lg:hidden">Photo Studio</span>
            </h1>
            <span className="hidden xs:inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 font-mono">
              v1.1
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-gray-500 truncate max-w-[100px] xs:max-w-[150px] sm:max-w-xs">
            {projectName} • {cardCount} фото
            {selectedCount > 0 && (
              <span className="ml-1 text-blue-600 font-medium">
                ({selectedCount})
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Center Main Tools: Add, Style Analysis, Products, Master Prompts, Connections, Group, AI Generation */}
      <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-1 scrollbar-none">
        <button
          id="btn-add-photos"
          onClick={onAddImage}
          className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50/80 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors shrink-0"
          title="Загрузить фото"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Фото</span>
        </button>

        {/* Style Analysis button */}
        <button
          id="btn-analyze-style"
          onClick={onAnalyzeStyle}
          disabled={isAnalyzingStyle}
          className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors shrink-0 cursor-pointer disabled:opacity-50"
          title="Анализ стиля выделенных фото (Gemini 2.5 Flash)"
        >
          <Palette className={`w-3.5 h-3.5 text-indigo-600 ${isAnalyzingStyle ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">Анализировать стиль</span>
          <span className="md:hidden">Стиль</span>
        </button>

        {/* Product Library button */}
        <button
          id="btn-toggle-products-library"
          onClick={onToggleProducts}
          className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors shrink-0 cursor-pointer ${
            isProductsOpen
              ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
              : 'text-gray-700 hover:text-blue-700 bg-gray-50 hover:bg-blue-50 border-gray-200 hover:border-blue-200'
          }`}
          title="Библиотека продуктов проекта"
        >
          <Package className="w-3.5 h-3.5 text-blue-500" />
          <span className="hidden sm:inline">Продукты</span>
        </button>

        {/* Master Prompts button */}
        <button
          id="btn-topbar-master-prompts"
          onClick={onOpenMasterPrompts}
          className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors shrink-0 cursor-pointer"
          title="Библиотека мастер-промптов"
        >
          <BookOpen className="w-3.5 h-3.5 text-purple-600" />
          <span className="hidden md:inline">Мастер-промпты</span>
        </button>

        {/* Group Button */}
        {canGroup && onGroupSelected && (
          <button
            id="btn-group-selected-cards"
            onClick={onGroupSelected}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 rounded-lg transition-colors shrink-0 animate-in fade-in"
            title="Сгруппировать выделенные карточки"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">Сгруппировать</span>
          </button>
        )}

        {/* Connections toggle button */}
        <button
          id="btn-toggle-connection-mode"
          onClick={onToggleConnectionMode}
          className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all shrink-0 cursor-pointer ${
            isConnectionMode
              ? 'bg-blue-600 text-white border-blue-700 shadow-xs ring-2 ring-blue-300'
              : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200'
          }`}
          title="Режим связей между карточками (L)"
        >
          <Link2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Связи (L)</span>
          {isConnectionMode && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping ml-0.5" />
          )}
        </button>

        {/* Site Mockup button */}
        {onAddSiteMockup && (
          <button
            id="btn-add-site-mockup"
            onClick={onAddSiteMockup}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors shrink-0 cursor-pointer ${
              hasSiteMockup
                ? 'bg-teal-50 text-teal-800 border-teal-300 shadow-2xs'
                : 'text-gray-700 hover:text-teal-700 bg-gray-50 hover:bg-teal-50 border-gray-200 hover:border-teal-200'
            }`}
            title="Загрузить макет/скриншот сайта как фоновый слой"
          >
            <Monitor className="w-3.5 h-3.5 text-teal-600" />
            <span className="hidden md:inline">Мокап сайта</span>
            <span className="md:hidden">Мокап</span>
            {hasSiteMockup && (
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 ml-0.5" />
            )}
          </button>
        )}

        {/* Export Images button */}
        {onExportImages && (
          <button
            id="btn-export-all-images"
            onClick={onExportImages}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors shrink-0 cursor-pointer"
            title="Скачать все сгенерированные изображения проекта"
          >
            <ImageDown className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden md:inline">Экспорт фото</span>
            <span className="md:hidden">Экспорт</span>
          </button>
        )}

        {/* AI Generation button */}
        <button
          id="btn-open-generation-panel"
          onClick={onToggleGeneration}
          className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 cursor-pointer ${
            isGenerationOpen
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200'
          }`}
          title="AI Генерация (G)"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">AI (G)</span>
          <span className="sm:hidden">AI</span>
        </button>
      </div>

      {/* Top Right Actions & Memory Tools */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Optimize Memory Button */}
        <button
          id="btn-optimize-memory"
          onClick={onOptimizeMemory}
          disabled={isOptimizing}
          className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-lg border shadow-xs transition-colors cursor-pointer ${
            isStorageHigh
              ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 animate-pulse'
              : 'bg-white hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 border-emerald-300'
          }`}
          title="Сжать все изображения в памяти до max 500px и quality 0.7"
        >
          <Zap className={`w-3.5 h-3.5 ${isOptimizing ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">
            {isOptimizing ? 'Сжатие...' : 'Оптимизировать'}
          </span>
        </button>

        {/* Clear Memory Button */}
        <button
          id="btn-clear-memory"
          onClick={onClearMemory}
          className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-medium bg-white hover:bg-red-50 text-red-600 hover:text-red-700 border border-red-200 rounded-lg shadow-xs transition-colors cursor-pointer"
          title="Очистить память (удалить все проекты и карточки, сохранив API-ключ)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Очистить</span>
        </button>

        {/* Storage Usage Widget */}
        <div
          id="topbar-storage-widget"
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] bg-emerald-50/80 text-emerald-800 border-emerald-200"
          title={`Хранилище IndexedDB (безлимитное): ${usedMb} MB использовано`}
        >
          <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
          <span className="font-medium">{usedMb} MB</span>
          <span className="text-[10px] text-emerald-600/80 bg-white/80 px-1 py-0.5 rounded font-mono">IndexedDB</span>
        </div>

        <button
          id="btn-topbar-settings"
          onClick={onOpenSettings}
          className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 rounded-lg border border-gray-300 shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
          title="Настройки Google Gemini API"
        >
          <Settings className="w-4 h-4 text-gray-600" />
          <span className="hidden 2xl:inline">Настройки</span>
        </button>

        <button
          id="btn-export-standalone-html"
          onClick={onOpenExportModal}
          className="hidden md:flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg shadow-xs transition-colors cursor-pointer"
          title="Экспортировать автономный HTML"
        >
          <FileCode className="w-3.5 h-3.5 text-amber-600" />
          <span className="hidden xl:inline">HTML</span>
        </button>

        <button
          id="btn-top-export-json"
          onClick={onExportProject}
          className="p-1.5 sm:px-2 sm:py-1.5 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
          title="Скачать проект JSON"
        >
          <Download className="w-3.5 h-3.5 text-gray-600" />
          <span className="hidden xl:inline">JSON</span>
        </button>

        <button
          id="btn-top-import-json"
          onClick={onImportProject}
          className="p-1.5 sm:px-2 sm:py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
          title="Загрузить проект JSON"
        >
          <Upload className="w-3.5 h-3.5 text-white" />
          <span className="hidden xl:inline">Импорт</span>
        </button>

        <button
          id="btn-top-clear-all"
          onClick={onClearAll}
          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-300 hover:border-red-200 rounded-lg transition-colors cursor-pointer"
          title="Очистить текущий проект"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};

