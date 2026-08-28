import React from 'react';
import {
  X,
  Palette,
  Package,
  BookOpen,
  Link2,
  Monitor,
  ImageDown,
  Download,
  Upload,
  FileCode,
  Settings,
  Zap,
  RotateCcw,
  Trash2,
  HardDrive,
  Sparkles,
} from 'lucide-react';
import { StorageInfo } from '../types';

interface RightDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  storageInfo: StorageInfo;
  onOpenSettings: () => void;
  onAnalyzeStyle: () => void;
  isAnalyzingStyle?: boolean;
  onToggleProducts: () => void;
  isProductsOpen?: boolean;
  onOpenMasterPrompts: () => void;
  isConnectionMode: boolean;
  onToggleConnectionMode: () => void;
  onAddSiteMockup?: () => void;
  hasSiteMockup?: boolean;
  onExportImages?: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  onOpenExportModal: () => void;
  onOptimizeMemory: () => void;
  onClearMemory: () => void;
  onClearAll: () => void;
  isOptimizing?: boolean;
  onToggleGeneration: () => void;
  isGenerationOpen: boolean;
}

export const RightDrawer: React.FC<RightDrawerProps> = ({
  isOpen,
  onClose,
  storageInfo,
  onOpenSettings,
  onAnalyzeStyle,
  isAnalyzingStyle = false,
  onToggleProducts,
  isProductsOpen = false,
  onOpenMasterPrompts,
  isConnectionMode,
  onToggleConnectionMode,
  onAddSiteMockup,
  hasSiteMockup = false,
  onExportImages,
  onExportProject,
  onImportProject,
  onOpenExportModal,
  onOptimizeMemory,
  onClearMemory,
  onClearAll,
  isOptimizing = false,
  onToggleGeneration,
  isGenerationOpen,
}) => {
  if (!isOpen) return null;

  const usedMb = (storageInfo.usedBytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        id="right-actions-drawer"
        className="relative w-full max-w-xs sm:max-w-sm bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-250 ease-out"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Меню инструментов</h2>
              <p className="text-[11px] text-gray-500">Быстрый доступ ко всем функциям</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          {/* Section: AI & Creative Tools */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase px-1">
              Креативные инструменты
            </span>

            <button
              onClick={() => {
                onToggleGeneration();
                onClose();
              }}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left font-medium transition-all ${
                isGenerationOpen
                  ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                  : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4" />
                <span>AI Генерация карточек</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/30 text-current font-mono">G</span>
            </button>

            <button
              onClick={() => {
                onAnalyzeStyle();
                onClose();
              }}
              disabled={isAnalyzingStyle}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 font-medium transition-colors disabled:opacity-50"
            >
              <Palette className={`w-4 h-4 text-indigo-600 ${isAnalyzingStyle ? 'animate-spin' : ''}`} />
              <span>Анализ стиля (Gemini)</span>
            </button>

            <button
              onClick={() => {
                onToggleProducts();
                onClose();
              }}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl border font-medium transition-colors ${
                isProductsOpen
                  ? 'bg-blue-600 text-white border-blue-700'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4 text-blue-500" />
                <span>Библиотека товаров</span>
              </div>
            </button>

            <button
              onClick={() => {
                onOpenMasterPrompts();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-purple-200 bg-purple-50/50 hover:bg-purple-100 text-purple-900 font-medium transition-colors"
            >
              <BookOpen className="w-4 h-4 text-purple-600" />
              <span>Мастер-промпты</span>
            </button>

            <button
              onClick={() => {
                onToggleConnectionMode();
                onClose();
              }}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl border font-medium transition-colors ${
                isConnectionMode
                  ? 'bg-blue-600 text-white border-blue-700'
                  : 'bg-white hover:bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Link2 className="w-4 h-4" />
                <span>Режим связей между фото</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">L</span>
            </button>

            {onAddSiteMockup && (
              <button
                onClick={() => {
                  onAddSiteMockup();
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border font-medium transition-colors ${
                  hasSiteMockup
                    ? 'bg-teal-50 text-teal-800 border-teal-300'
                    : 'bg-gray-50 hover:bg-teal-50 text-gray-800 border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Monitor className="w-4 h-4 text-teal-600" />
                  <span>Фоновый макет сайта</span>
                </div>
                {hasSiteMockup && <span className="w-2 h-2 rounded-full bg-teal-500" />}
              </button>
            )}
          </div>

          {/* Section: Export & Import */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase px-1">
              Экспорт и Сохранение
            </span>

            {onExportImages && (
              <button
                onClick={() => {
                  onExportImages();
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-900 font-medium transition-colors"
              >
                <ImageDown className="w-4 h-4 text-emerald-600" />
                <span>Скачать все сгенерированные фото</span>
              </button>
            )}

            <button
              onClick={() => {
                onExportProject();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-medium transition-colors"
            >
              <Download className="w-4 h-4 text-gray-600" />
              <span>Скачать проект (JSON)</span>
            </button>

            <button
              onClick={() => {
                onImportProject();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Загрузить проект (JSON)</span>
            </button>

            <button
              onClick={() => {
                onOpenExportModal();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-medium transition-colors"
            >
              <FileCode className="w-4 h-4 text-amber-600" />
              <span>Автономный HTML просмотрщик</span>
            </button>
          </div>

          {/* Section: Settings & Memory */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase px-1">
              Настройки и Память
            </span>

            <button
              onClick={() => {
                onOpenSettings();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-medium transition-colors"
            >
              <Settings className="w-4 h-4 text-gray-600" />
              <span>Настройки Gemini API</span>
            </button>

            <button
              onClick={() => {
                onOptimizeMemory();
                onClose();
              }}
              disabled={isOptimizing}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-medium transition-colors disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 text-emerald-600 ${isOptimizing ? 'animate-spin' : ''}`} />
              <span>{isOptimizing ? 'Сжатие картинок...' : 'Оптимизировать память'}</span>
            </button>

            <button
              onClick={() => {
                onClearAll();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-600 font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Очистить холст текущего проекта</span>
            </button>

            <button
              onClick={() => {
                onClearMemory();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Сбросить всю базу данных</span>
            </button>
          </div>
        </div>

        {/* Footer: Storage Info */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-600" />
            <div>
              <span className="font-semibold text-gray-800">{usedMb} MB</span>
              <span className="text-[10px] text-gray-500 block">IndexedDB (безлимит)</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono text-[10px]">
            Online Ready
          </span>
        </div>
      </div>
    </div>
  );
};
