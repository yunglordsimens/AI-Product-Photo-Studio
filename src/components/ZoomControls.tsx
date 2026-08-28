import React from 'react';
import { ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';

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
      className="absolute bottom-6 right-6 flex items-center bg-white border border-gray-200 rounded-lg shadow-xl p-1 z-30 select-none"
    >
      <button
        onClick={onZoomOut}
        id="btn-ctrl-zoom-out"
        className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
        title="Уменьшить (Ctrl + Колесо вниз)"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-4 bg-gray-200 mx-0.5" />

      <button
        onClick={onResetZoom}
        id="btn-ctrl-zoom-reset"
        className="px-2.5 py-1 text-xs font-mono font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded min-w-[50px] text-center transition-colors"
        title="Сбросить масштаб (100%)"
      >
        {Math.round(zoom * 100)}%
      </button>

      <div className="w-[1px] h-4 bg-gray-200 mx-0.5" />

      <button
        onClick={onZoomIn}
        id="btn-ctrl-zoom-in"
        className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
        title="Увеличить (Ctrl + Колесо вверх)"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-4 bg-gray-200 mx-0.5" />

      <button
        onClick={onFitCards}
        id="btn-ctrl-fit-view"
        className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
        title="Показать все карточки на экране"
      >
        <Maximize className="w-4 h-4" />
      </button>
    </div>
  );
};
