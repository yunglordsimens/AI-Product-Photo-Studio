import React, { memo } from 'react';
import { X, Copy, Maximize2, Move, Link2 } from 'lucide-react';
import { Card } from '../types';

interface CardItemProps {
  card: Card;
  isSelected: boolean;
  isConnectingSource?: boolean;
  isConnectionMode?: boolean;
  onMouseDown: (e: React.MouseEvent, cardId: string) => void;
  onDelete: (cardId: string) => void;
  onDuplicate: (card: Card) => void;
  onPreview: (card: Card) => void;
}

export const CardItem: React.FC<CardItemProps> = memo(
  ({
    card,
    isSelected,
    isConnectingSource = false,
    isConnectionMode = false,
    onMouseDown,
    onDelete,
    onDuplicate,
    onPreview,
  }) => {
    return (
      <div
        id={`card-node-${card.id}`}
        onMouseDown={(e) => onMouseDown(e, card.id)}
        style={{
          transform: `translate(${card.x}px, ${card.y}px)`,
          width: `${card.width}px`,
          zIndex: isConnectingSource ? 40 : isSelected ? 30 : card.zIndex || 10,
        }}
        className={`group absolute top-0 left-0 bg-white rounded-lg p-1 transition-[box-shadow,border-color] duration-150 select-none ${
          isConnectionMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        } ${
          isConnectingSource
            ? 'border-2 border-indigo-600 shadow-2xl ring-4 ring-indigo-500/30'
            : isSelected
            ? 'border-2 border-blue-500 shadow-xl ring-4 ring-blue-500/10'
            : isConnectionMode
            ? 'border border-blue-300 shadow-md hover:border-blue-500 hover:ring-2 hover:ring-blue-400/20'
            : 'border border-gray-200 shadow-md hover:border-gray-300'
        }`}
      >
        {/* Connection Source Indicator Badge */}
        {isConnectingSource && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 z-30 animate-bounce">
            <Link2 className="w-3 h-3" />
            <span>Начало связи (кликните цель)</span>
          </div>
        )}

        {/* Card Header Overlay */}
        {!isConnectionMode && (
          <div className="absolute -top-3 -right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPreview(card);
              }}
              className="w-6 h-6 rounded-full bg-white text-gray-700 border border-gray-200 flex items-center justify-center text-xs shadow-md hover:bg-gray-50 transition-colors"
              title="Просмотр"
            >
              <Maximize2 className="w-3 h-3" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(card);
              }}
              className="w-6 h-6 rounded-full bg-white text-gray-700 border border-gray-200 flex items-center justify-center text-xs shadow-md hover:bg-gray-50 transition-colors"
              title="Дублировать"
            >
              <Copy className="w-3 h-3" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(card.id);
              }}
              className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md hover:bg-red-600 transition-colors"
              title="Удалить карточку"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Image Display */}
        <div className="w-full bg-gray-100 rounded-sm flex items-center justify-center overflow-hidden">
          <img
            src={card.src}
            alt={card.name || 'Product reference'}
            className="w-full h-auto max-w-[300px] object-cover pointer-events-none block"
            loading="lazy"
            draggable={false}
          />
        </div>

        {/* Card Footer Bar with Name and Dimensions */}
        <div className="p-1.5 flex justify-between items-center bg-white">
          <span className="text-[10px] text-gray-500 truncate max-w-[130px]" title={card.name}>
            {card.name || 'ref_product.png'}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 shrink-0">
            {card.width}×{card.height || '300'}
          </span>
        </div>
      </div>
    );
  }
);

CardItem.displayName = 'CardItem';
