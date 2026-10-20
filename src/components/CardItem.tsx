import React, { memo, useState } from 'react';
import { Card } from '../types';
import { REFERENCE_ROLES } from '../utils/referenceRoles';

interface CardItemProps {
  card: Card;
  isSelected: boolean;
  /** Faded back while another group is in focus */
  dimmed?: boolean;
  isConnectingSource?: boolean;
  isConnectionMode?: boolean;
  onMouseDown: (e: React.MouseEvent, cardId: string) => void;
  onPointerDown?: (e: React.PointerEvent, cardId: string) => void;
  onTouchStart?: (e: React.TouchEvent, cardId: string) => void;
  onDelete: (cardId: string) => void;
  onDuplicate: (card: Card) => void;
  onPreview: (card: Card) => void;
  /** Mark what to take from this photo (фон, свет, ракурс…) */
  onChangeTakes?: (cardId: string, takes: string[]) => void;
  /** Show all role chips to pick from (only when this is the one selected photo) */
  editTakes?: boolean;
}

const stop = {
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
};

/* A card on the board reads like an object in a printed catalogue: the photo, a caption under it, nothing else.
   Selected = black outline, start of a link = yellow outline. Actions appear as text above the photo. */
export const CardItem: React.FC<CardItemProps> = memo(
  ({
    card,
    isSelected,
    dimmed = false,
    isConnectingSource = false,
    isConnectionMode = false,
    onMouseDown,
    onPointerDown,
    onTouchStart,
    onDelete,
    onDuplicate,
    onPreview,
    onChangeTakes,
    editTakes = false,
  }) => {
    const [showInfo, setShowInfo] = useState(false);
    const meta = card.meta;
    const kindLabel = meta
      ? { generate: 'Генерация', product: 'Продукт в сцене', fix: 'Исправление исходника', batch: 'Пакет' }[meta.kind]
      : '';
    const outline = isConnectingSource
      ? 'ofst-outline'
      : isSelected
      ? 'ofst-outline'
      : isConnectionMode
      ? 'hover:ofst-outline'
      : '';
    return (
      <div
        id={`card-node-${card.id}`}
        onMouseDown={(e) => onMouseDown(e, card.id)}
        onPointerDown={(e) => onPointerDown && onPointerDown(e, card.id)}
        onTouchStart={(e) => onTouchStart && onTouchStart(e, card.id)}
        style={{
          transform: `translate3d(${card.x}px, ${card.y}px, 0)`,
          width: `${card.width}px`,
          zIndex: isConnectingSource ? 40 : isSelected ? 30 : card.zIndex || 10,
          touchAction: 'none',
        }}
        className={`group absolute top-0 left-0 select-none pointer-events-auto ${dimmed ? 'opacity-15' : ''} ${
          isConnectionMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        {isConnectingSource && (
          <div className="absolute bottom-full left-0 mb-1 bg-[var(--marker)] px-1 text-[11px] whitespace-nowrap z-30">
            Начало связи — нажми цель
          </div>
        )}

        {/* Actions: text above the photo, on hover or when selected (touch) */}
        {!isConnectionMode && (
          <div
            className={`absolute bottom-full right-0 flex bg-white text-[11px] z-20 ${
              isSelected ? 'flex' : 'hidden group-hover:flex'
            }`}
            {...stop}
          >
            <button onClick={(e) => { e.stopPropagation(); onPreview(card); }} className="px-1.5 h-5 hover:bg-[var(--soft)]" title="Просмотр">
              смотреть
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDuplicate(card); }} className="px-1.5 h-5 hover:bg-[var(--soft)]" title="Дублировать">
              копия
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(card.id); }} className="px-1.5 h-5 hover:bg-[var(--marker)]" title="Удалить карточку">
              удалить
            </button>
          </div>
        )}

        <div className={`bg-[var(--soft-2)] ${outline}`}>
          <img
            src={card.src}
            alt={card.name || 'Product reference'}
            className="w-full h-auto object-cover pointer-events-none block"
            loading="lazy"
            draggable={false}
          />
        </div>

        {/* How it was made: details on click of "как сделано" */}
        {meta && showInfo && (
          <div
            className="absolute left-0 right-0 top-full mt-1 z-20 p-1.5 bg-white text-[11px] leading-snug space-y-1 max-h-48 overflow-y-auto cursor-text select-text"
            {...stop}
          >
            <div className="font-medium">{kindLabel}</div>
            <div>
              <span className="text-[var(--grey)]">Мастер-промпт:</span> {meta.masterPromptName || 'свой промпт'}
            </div>
            {meta.productName && (
              <div>
                <span className="text-[var(--grey)]">Продукт:</span> {meta.productName}
              </div>
            )}
            {meta.prompt && <div className="whitespace-pre-wrap break-words">{meta.prompt}</div>}
            <div className="text-[var(--grey)]">
              {meta.model}, источников: {meta.sourceIds?.length || 0}
            </div>
          </div>
        )}

        {/* Caption under the photo */}
        <div className="flex items-baseline gap-2 pt-0.5 text-[11px] leading-tight">
          <span className="truncate text-[var(--grey)] group-hover:text-[var(--fg)]" title={card.name}>
            {card.name || 'product.png'}
          </span>
          {meta && (
            <button
              type="button"
              {...stop}
              onClick={(e) => {
                e.stopPropagation();
                setShowInfo((v) => !v);
              }}
              className={`shrink-0 ml-auto cursor-pointer ${showInfo ? 'text-[var(--fg)] underline' : 'text-[var(--grey)] hover:text-[var(--fg)]'}`}
              title={meta.masterPromptName ? `Мастер-промпт: ${meta.masterPromptName}` : 'Как сделано'}
            >
              как сделано
            </button>
          )}
        </div>

        {/* What to take from this reference: shown when selected, or when something is marked */}
        {onChangeTakes && (editTakes || (card.takes && card.takes.length > 0)) && (
          <div className="flex flex-wrap gap-x-1 pt-0.5 text-[11px] leading-4" {...stop}>
            {editTakes && <span className="text-[var(--grey)]">берём:</span>}
            {REFERENCE_ROLES.filter((r) => editTakes || card.takes?.includes(r.id)).map((r) => {
              const on = Boolean(card.takes?.includes(r.id));
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = on ? (card.takes || []).filter((t) => t !== r.id) : [...(card.takes || []), r.id];
                    onChangeTakes(card.id, next);
                  }}
                  className={`px-0.5 cursor-pointer ${on ? 'bg-[var(--fg)] text-white' : 'text-[var(--grey)] hover:text-[var(--fg)]'}`}
                  title={on ? 'Не брать' : 'Брать с этого фото'}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

CardItem.displayName = 'CardItem';
