import React from 'react';
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
  toolLabels: { id: string; label: string }[];
  hiddenTools: string[];
  onToggleTool: (id: string) => void;
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
  toolLabels,
  hiddenTools,
  onToggleTool,
}) => {
  if (!isOpen) return null;

  const usedMb = (storageInfo.usedBytes / (1024 * 1024)).toFixed(1);
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const row = 'w-full flex items-baseline justify-between gap-2 px-1 h-8 text-left text-[13px] hover:bg-[var(--soft)] disabled:opacity-40';

  return (
      <div id="right-actions-drawer" className="ofst-panel h-full flex flex-col p-2">
        <div className="ofst-run shrink-0 mb-2">
          <span>Меню</span>
          <button onClick={onClose} className="ofst-x" aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
          {/* Same as the top bar on desktop, so only on smaller screens */}
          <div className="lg:hidden">
            <div className="ofst-run mb-0.5">
              <span>Инструменты</span>
            </div>
            <button onClick={act(onToggleGeneration)} className={`${row} ${isGenerationOpen ? '!bg-[var(--fg)] text-white' : ''}`}>
              <span>AI генерация</span>
              <span className="text-[11px] opacity-60">G</span>
            </button>
            <button onClick={act(onAnalyzeStyle)} disabled={isAnalyzingStyle} className={row}>
              <span>{isAnalyzingStyle ? 'Смотрю стиль…' : 'Стиль: описать выделенные'}</span>
            </button>
            <button onClick={act(onToggleProducts)} className={`${row} ${isProductsOpen ? '!bg-[var(--fg)] text-white' : ''}`}>
              <span>Продукты</span>
            </button>
            <button onClick={act(onOpenMasterPrompts)} className={row}>
              <span>Мастер-промпты</span>
            </button>
            <button onClick={act(onToggleConnectionMode)} className={`${row} ${isConnectionMode ? '!bg-[var(--fg)] text-white' : ''}`}>
              <span>Связи между фото</span>
              <span className="text-[11px] opacity-60">L</span>
            </button>
            {onAddSiteMockup && (
              <button onClick={act(onAddSiteMockup)} className={row}>
                <span>Макет сайта</span>
                {hasSiteMockup && <span className="text-[11px] bg-[var(--marker)] px-0.5">есть</span>}
              </button>
            )}
          </div>

          <div>
            <div className="ofst-run mb-0.5">
              <span>Сохранить и открыть</span>
            </div>
            {onExportImages && (
              <button onClick={act(onExportImages)} className={row}>
                <span>Скачать сгенерированные фото</span>
              </button>
            )}
            <button onClick={act(onExportProject)} className={row}>
              <span>Скачать проект</span>
              <span className="text-[11px] text-[var(--grey)]">JSON</span>
            </button>
            <button onClick={act(onImportProject)} className={row}>
              <span>Открыть проект</span>
              <span className="text-[11px] text-[var(--grey)]">JSON</span>
            </button>
            <button onClick={act(onOpenExportModal)} className={row}>
              <span>Студия одним файлом</span>
              <span className="text-[11px] text-[var(--grey)]">HTML</span>
            </button>
          </div>

          <div>
            <div className="ofst-run mb-0.5">
              <span>Кнопки сверху</span>
              <span>{toolLabels.length - hiddenTools.length} из {toolLabels.length}</span>
            </div>
            {toolLabels.map((t) => {
              const on = !hiddenTools.includes(t.id);
              return (
                <label key={t.id} className={`${row} cursor-pointer`}>
                  <span>{t.label}</span>
                  <input type="checkbox" checked={on} onChange={() => onToggleTool(t.id)} className="accent-black w-3.5 h-3.5 self-center" />
                </label>
              );
            })}
          </div>

          <div>
            <div className="ofst-run mb-0.5">
              <span>Настройки и память</span>
            </div>
            <button onClick={act(onOpenSettings)} className={row}>
              <span>Доступ и модель</span>
            </button>
            <button
              onClick={act(onOptimizeMemory)}
              disabled={isOptimizing}
              className={row}
              title="Пересохраняет все фото проектов чуть легче, чтобы освободить память браузера. Нужно, только если память почти заполнена"
            >
              <span>{isOptimizing ? 'Сжимаю фото…' : 'Освободить память (сжать фото)'}</span>
            </button>
            <button onClick={act(onClearAll)} className={`${row} hover:!bg-[var(--marker)]`}>
              <span>Очистить доску проекта</span>
            </button>
            <button onClick={act(onClearMemory)} className={`${row} hover:!bg-[var(--marker)]`}>
              <span>Стереть всю базу в браузере</span>
            </button>
          </div>
        </div>

        <div className="ofst-run shrink-0 !border-b-0 border-t border-[var(--fg)] pt-1">
          <span>В этом браузере</span>
          <span className="tabular-nums">{usedMb} MB</span>
        </div>
      </div>
  );
};
