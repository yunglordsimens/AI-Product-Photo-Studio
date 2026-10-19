import React from 'react';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitCards: () => void;
}

/* Zoom: four text cells on a white strip, bottom right */
export const ZoomControls: React.FC<ZoomControlsProps> = ({ zoom, onZoomIn, onZoomOut, onResetZoom, onFitCards }) => (
  <div id="canvas-zoom-controls" className="absolute bottom-2 right-2 flex bg-white z-30 select-none touch-manipulation">
    <button onClick={onZoomOut} id="btn-ctrl-zoom-out" className="ofst-cell w-7" title="Уменьшить" aria-label="Уменьшить">
      −
    </button>
    <button
      onClick={onResetZoom}
      id="btn-ctrl-zoom-reset"
      className="ofst-cell min-w-[48px] tabular-nums"
      title="Сбросить масштаб (100%)"
      aria-label="Сбросить масштаб"
    >
      {Math.round(zoom * 100)}%
    </button>
    <button onClick={onZoomIn} id="btn-ctrl-zoom-in" className="ofst-cell w-7" title="Увеличить" aria-label="Увеличить">
      +
    </button>
    <button onClick={onFitCards} id="btn-ctrl-fit-view" className="ofst-cell" title="Показать все фото" aria-label="Показать все фото">
      Всё
    </button>
  </div>
);
