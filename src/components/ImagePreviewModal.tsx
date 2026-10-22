import React from 'react';
import { Card } from '../types';

interface ImagePreviewModalProps {
  card: Card | null;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ card, onClose }) => {
  if (!card) return null;

  const handleDownloadImage = () => {
    const a = document.createElement('a');
    a.href = card.src;
    a.download = `${card.name || 'product_ref'}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div id="modal-image-preview-backdrop" className="fixed inset-0 bg-black/40 ofst-fade z-50 flex items-center justify-center p-2" onClick={onClose}>
      <div
        id="modal-image-preview-content"
        className="relative max-w-5xl max-h-[96vh] bg-white flex flex-col p-2 gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ofst-run">
          <span className="truncate">{card.name || 'Фото'}</span>
          <span className="tabular-nums">
            {card.width} × {card.height || 'auto'}
          </span>
          <span className="flex gap-3">
            <button onClick={handleDownloadImage} className="hover:text-[var(--fg)] cursor-pointer">
              сохранить фото
            </button>
            <button onClick={onClose} className="ofst-x" aria-label="Закрыть">
              ×
            </button>
          </span>
        </div>
        <div className="flex items-center justify-center bg-[var(--soft)] overflow-auto">
          <img src={card.src} alt={card.name || 'Фото'} className="max-h-[86vh] w-auto max-w-full object-contain" />
        </div>
      </div>
    </div>
  );
};
