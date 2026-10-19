import React, { useState, useRef, useEffect, memo } from 'react';
import { Note, NoteColor } from '../types';

interface NoteItemProps {
  note: Note;
  isSelected: boolean;
  isAttached: boolean;
  attachedCardName?: string;
  onMouseDown: (e: React.MouseEvent, noteId: string) => void;
  onPointerDown?: (e: React.PointerEvent, noteId: string) => void;
  onTouchStart?: (e: React.TouchEvent, noteId: string) => void;
  onUpdateText: (noteId: string, text: string) => void;
  onUpdateColor: (noteId: string, color: NoteColor) => void;
  onUpdateSize: (noteId: string, width: number, height: number) => void;
  onDelete: (noteId: string) => void;
  onDetach: (noteId: string) => void;
}

// OFST palette: the yellow marker, paper, greys and ink. Keys stay the same so old projects keep their notes.
const COLOR_STYLES: Record<
  NoteColor,
  { bg: string; border: string; text: string; header: string; activeRing: string }
> = {
  yellow: { bg: 'bg-[#ffe500]', border: '', text: 'text-[#0a0a0a]', header: '', activeRing: '' },
  pink: { bg: 'bg-[#e4e4e2]', border: '', text: 'text-[#0a0a0a]', header: '', activeRing: '' },
  blue: { bg: 'bg-[#0a0a0a]', border: '', text: 'text-[#f4f4f2]', header: '', activeRing: '' },
  green: { bg: 'bg-[#cfcfcc]', border: '', text: 'text-[#0a0a0a]', header: '', activeRing: '' },
  white: { bg: 'bg-white', border: '', text: 'text-[#0a0a0a]', header: '', activeRing: '' },
};

const COLOR_OPTIONS: { key: NoteColor; label: string; bgClass: string }[] = [
  { key: 'yellow', label: 'Маркер', bgClass: 'bg-[#ffe500]' },
  { key: 'white', label: 'Белая', bgClass: 'bg-white' },
  { key: 'pink', label: 'Серая', bgClass: 'bg-[#e4e4e2]' },
  { key: 'green', label: 'Тёмно-серая', bgClass: 'bg-[#cfcfcc]' },
  { key: 'blue', label: 'Чёрная', bgClass: 'bg-[#0a0a0a]' },
];

export const NoteItem: React.FC<NoteItemProps> = memo(
  ({
    note,
    isSelected,
    isAttached,
    attachedCardName,
    onMouseDown,
    onPointerDown,
    onTouchStart,
    onUpdateText,
    onUpdateColor,
    onUpdateSize,
    onDelete,
    onDetach,
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(note.text);
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const isResizingRef = useRef(false);
    const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number }>({
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    });

    const styleTheme = COLOR_STYLES[note.color] || COLOR_STYLES.yellow;

    // Sync local editText when note.text changes outside
    useEffect(() => {
      setEditText(note.text);
    }, [note.text]);

    // Focus textarea on edit mode
    useEffect(() => {
      if (isEditing) {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }
    }, [isEditing]);

    const handleSaveText = () => {
      setIsEditing(false);
      if (editText !== note.text) {
        onUpdateText(note.id, editText);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleSaveText();
      }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditing(true);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    };

    // Close context menu on outside click
    useEffect(() => {
      if (!contextMenuPos) return;
      const closeMenu = () => setContextMenuPos(null);
      window.addEventListener('click', closeMenu);
      window.addEventListener('contextmenu', closeMenu);
      return () => {
        window.removeEventListener('click', closeMenu);
        window.removeEventListener('contextmenu', closeMenu);
      };
    }, [contextMenuPos]);

    // Resizing logic
    const handleResizeMouseDown = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isResizingRef.current = true;
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        w: note.width || 180,
        h: note.height || 140,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isResizingRef.current) return;
        const dx = ev.clientX - resizeStartRef.current.x;
        const dy = ev.clientY - resizeStartRef.current.y;
        const newW = Math.max(120, Math.min(400, Math.round(resizeStartRef.current.w + dx)));
        const newH = Math.max(80, Math.min(400, Math.round(resizeStartRef.current.h + dy)));
        onUpdateSize(note.id, newW, newH);
      };

      const handleMouseUp = () => {
        isResizingRef.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    };

    const swatches = (size: string, close?: boolean) =>
      COLOR_OPTIONS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUpdateColor(note.id, c.key);
            if (close) setContextMenuPos(null);
          }}
          title={c.label}
          className={`${size} cursor-pointer ${c.bgClass} ${note.color === c.key ? 'outline-1 outline-offset-1 outline-current' : ''}`}
        />
      ));

    return (
      <>
        <div
          id={`note-node-${note.id}`}
          onMouseDown={(e) => onMouseDown(e, note.id)}
          onPointerDown={(e) => onPointerDown && onPointerDown(e, note.id)}
          onTouchStart={(e) => onTouchStart && onTouchStart(e, note.id)}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          style={{
            transform: `translate3d(${note.x}px, ${note.y}px, 0)`,
            width: `${note.width || 180}px`,
            minHeight: `${note.height || 140}px`,
            zIndex: isSelected ? 40 : note.zIndex || 20,
            touchAction: 'none',
          }}
          className={`group absolute top-0 left-0 select-none flex flex-col pointer-events-auto cursor-grab active:cursor-grabbing p-1.5 ${styleTheme.bg} ${styleTheme.text} ${
            isSelected ? 'outline-1 outline-[var(--fg)] outline-offset-1' : ''
          }`}
        >
          {/* Head: small line, like a caption. Controls show on hover. */}
          <div className="flex items-baseline justify-between gap-1 text-[11px] leading-4 select-none">
            <span className="truncate opacity-60" title={isAttached ? `Прикреплена к: ${attachedCardName || 'карточке'}` : undefined}>
              {isAttached ? `↳ ${attachedCardName || 'прикреплена'}` : 'Заметка'}
            </span>
            <span className="hidden group-hover:flex items-center gap-1 shrink-0">
              {swatches('w-2.5 h-2.5')}
              {isAttached && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDetach(note.id);
                  }}
                  className="underline cursor-pointer ml-1"
                  title="Открепить от карточки"
                >
                  открепить
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(note.id);
                }}
                className="underline cursor-pointer ml-1"
                title="Удалить заметку"
              >
                удалить
              </button>
            </span>
          </div>

          <div className="pt-1 flex-1 flex flex-col min-h-[60px]">
            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={handleSaveText}
                onKeyDown={handleKeyDown}
                placeholder="Для генерации: «свет сверху», «тёмный фон»…"
                className="w-full h-full flex-1 !bg-transparent resize-none border-none !outline-none p-0 text-[13px] leading-snug font-sans placeholder:opacity-40 placeholder:text-current select-text cursor-text"
              />
            ) : (
              <div
                className="text-[13px] leading-snug whitespace-pre-wrap break-words flex-1 cursor-text"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
              >
                {note.text ? note.text : <span className="opacity-40">Пустая заметка</span>}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[10px] leading-3 opacity-0 group-hover:opacity-50 select-none">
            <span>{isEditing ? 'Esc — готово' : 'идёт в промпт'}</span>
            <div onMouseDown={handleResizeMouseDown} className="w-3 h-3 cursor-nwse-resize text-right" title="Изменить размер">
              ◢
            </div>
          </div>
        </div>

        {contextMenuPos && (
          <div
            style={{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px` }}
            className="fixed z-100 bg-white min-w-[160px] text-[13px] text-[var(--fg)] select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1 px-2 h-8">{swatches('w-4 h-4', true)}</div>
            {isAttached && (
              <button
                type="button"
                onClick={() => {
                  onDetach(note.id);
                  setContextMenuPos(null);
                }}
                className="w-full text-left px-2 h-7 hover:bg-[var(--soft)] cursor-pointer"
              >
                Открепить от карточки
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
                setContextMenuPos(null);
              }}
              className="w-full text-left px-2 h-7 hover:bg-[var(--soft)] cursor-pointer"
            >
              Редактировать
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete(note.id);
                setContextMenuPos(null);
              }}
              className="w-full text-left px-2 h-7 hover:bg-[var(--marker)] cursor-pointer"
            >
              Удалить
            </button>
          </div>
        )}
      </>
    );
  }
);

NoteItem.displayName = 'NoteItem';
