import React from 'react';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitCards: () => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitCards,
}) => {
  return (
    <div
      id="canvas-zoom-controls"
      className="absolute bottom-4 right-3 sm:bottom-6 sm:right-6 flex items-center bg-white/95 backdrop-blur-xs border border-gray-200 rounded-xl shadow-lg p-1 z-30 select-none touch-manipulation"
    >
      <button
        onClick={onZoomOut}
        id="btn-ctrl-zoom-out"
        className="w-8 h-8 sm:w-8 sm:h-8 flex items-center justify-center text-gray-700 hover:text-gray-900 active:bg-gray-200 hover:bg-gray-100 rounded-lg transition-colors"
        title="Уменьшить"
        aria-label="Уменьшить"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-4 bg-gray-200 mx-0.5" />

      <button
        onClick={onResetZoom}
        id="btn-ctrl-zoom-reset"
        className="px-2 py-1 text-xs font-mono font-semibold text-gray-700 hover:text-gray-900 active:bg-gray-200 hover:bg-gray-100 rounded-md min-w-[46px] text-center transition-colors"
        title="Сбросить масштаб (100%)"
        aria-label="Сбросить масштаб"
      >
        {Math.round(zoom * 100)}%
      </button>

      <div className="w-[1px] h-4 bg-gray-200 mx-0.5" />

      <button
        onClick={onZoomIn}
        id="btn-ctrl-zoom-in"
        className="w-8 h-8 flex items-center justify-center text-gray-700 hover:text-gray-900 active:bg-gray-200 hover:bg-gray-100 rounded-lg transition-colors"
        title="Увеличить"
        aria-label="Увеличить"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-4 bg-gray-200 mx-0.5" />

      <button
        onClick={onFitCards}
        id="btn-ctrl-fit-view"
        className="w-8 h-8 flex items-center justify-center text-gray-700 hover:text-gray-900 active:bg-gray-200 hover:bg-gray-100 rounded-lg transition-colors"
        title="Показать все фото"
        aria-label="Показать все фото"
      >
        <Maximize className="w-4 h-4" />
      </button>
    </div>
  );
};
