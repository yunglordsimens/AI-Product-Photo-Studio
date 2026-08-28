import React from 'react';
import { X, Download } from 'lucide-react';
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
    <div
      id="modal-image-preview-backdrop"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        id="modal-image-preview-content"
        className="relative max-w-4xl max-h-[90vh] bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 px-5 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {card.name || 'Референс товара'}
            </span>
            <span className="text-[10px] text-gray-500 font-mono px-2 py-0.5 bg-gray-100 rounded">
              {card.width} × {card.height || 'auto'} px
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadImage}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Сохранить фото</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image Content */}
        <div className="p-6 flex items-center justify-center bg-gray-100/50 overflow-auto max-h-[calc(90vh-60px)]">
          <img
            src={card.src}
            alt={card.name || 'Product preview'}
            className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain shadow-md border border-gray-200"
          />
        </div>
      </div>
    </div>
  );
};
