import React, { useState, useRef, useEffect, memo } from 'react';
import { Note, NoteColor } from '../types';
import { Paperclip, X, MoreVertical, Trash2, Unlink } from 'lucide-react';

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

const COLOR_STYLES: Record<
  NoteColor,
  { bg: string; border: string; text: string; header: string; activeRing: string }
> = {
  yellow: {
    bg: 'bg-[#fef9c3]',
    border: 'border-[#fde047]',
    text: 'text-[#713f12]',
    header: 'bg-[#fef08a]',
    activeRing: 'ring-[#eab308]',
  },
  pink: {
    bg: 'bg-[#fce7f3]',
    border: 'border-[#fbcfe8]',
    text: 'text-[#831843]',
    header: 'bg-[#fbcfe8]',
    activeRing: 'ring-[#ec4899]',
  },
  blue: {
    bg: 'bg-[#e0f2fe]',
    border: 'border-[#bae6fd]',
    text: 'text-[#0369a1]',
    header: 'bg-[#bae6fd]',
    activeRing: 'ring-[#0284c7]',
  },
  green: {
    bg: 'bg-[#dcfce7]',
    border: 'border-[#bbf7d0]',
    text: 'text-[#166534]',
    header: 'bg-[#bbf7d0]',
    activeRing: 'ring-[#22c55e]',
  },
  white: {
    bg: 'bg-[#ffffff]',
    border: 'border-[#e5e7eb]',
    text: 'text-[#1f2937]',
    header: 'bg-[#f3f4f6]',
    activeRing: 'ring-gray-400',
  },
};

const COLOR_OPTIONS: { key: NoteColor; label: string; bgClass: string }[] = [
  { key: 'yellow', label: 'Жёлтый', bgClass: 'bg-[#fde047]' },
  { key: 'pink', label: 'Розовый', bgClass: 'bg-[#f472b6]' },
  { key: 'blue', label: 'Голубой', bgClass: 'bg-[#38bdf8]' },
  { key: 'green', label: 'Зелёный', bgClass: 'bg-[#4ade80]' },
  { key: 'white', label: 'Белый', bgClass: 'bg-white border border-gray-300' },
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
          className={`group absolute top-0 left-0 rounded-xl shadow-lg border transition-all duration-100 select-none flex flex-col overflow-hidden pointer-events-auto cursor-grab active:cursor-grabbing ${
            styleTheme.bg
          } ${styleTheme.border} ${styleTheme.text} ${
            isSelected
              ? `ring-3 ${styleTheme.activeRing} shadow-2xl scale-[1.01]`
              : 'hover:shadow-xl'
          }`}
        >
          {/* Header Bar */}
          <div
            className={`px-2.5 py-1.5 flex items-center justify-between border-b border-black/5 select-none ${styleTheme.header}`}
          >
            {/* Attachment Indicator / Paperclip Badge */}
            <div className="flex items-center gap-1 min-w-0">
              {isAttached ? (
                <div
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/10 text-[10px] font-semibold truncate"
                  title={`Прикреплено к: ${attachedCardName || 'карточке'}`}
                >
                  <Paperclip className="w-3 h-3 shrink-0 text-gray-700 animate-pulse" />
                  <span className="truncate max-w-[80px] text-gray-800">
                    {attachedCardName || 'Прикреплено'}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] font-medium opacity-60">Заметка</span>
              )}
            </div>

            {/* Quick Color Pickers on hover / header controls */}
            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
              <div className="hidden group-hover:flex items-center gap-1 mr-1">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateColor(note.id, c.key);
                    }}
                    title={c.label}
                    className={`w-3.5 h-3.5 rounded-full cursor-pointer hover:scale-125 transition-transform ${
                      c.bgClass
                    } ${note.color === c.key ? 'ring-1.5 ring-gray-900 shadow-xs' : ''}`}
                  />
                ))}
              </div>

              {isAttached && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDetach(note.id);
                  }}
                  className="p-0.5 rounded hover:bg-black/10 text-gray-700 transition-colors"
                  title="Открепить от карточки"
                >
                  <Unlink className="w-3 h-3" />
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(note.id);
                }}
                className="p-0.5 rounded hover:bg-red-500 hover:text-white text-gray-700 transition-colors"
                title="Удалить заметку"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Body Content / Text Area */}
          <div className="p-2.5 flex-1 flex flex-col min-h-[70px]">
            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={handleSaveText}
                onKeyDown={handleKeyDown}
                placeholder="Текст для генерации (напр. 'свет сверху', 'тёмный фон')..."
                className="w-full h-full flex-1 bg-transparent resize-none border-none outline-none text-xs leading-relaxed font-sans placeholder:text-black/30 select-text cursor-text"
              />
            ) : (
              <div
                className="text-xs leading-relaxed whitespace-pre-wrap break-words flex-1 cursor-text font-sans"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
              >
                {note.text ? (
                  note.text
                ) : (
                  <span className="italic opacity-40">
                    Дважды кликните, чтобы написать текст заметки...
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Bottom info & Resize Handle */}
          <div className="px-2 py-1 flex items-center justify-between text-[9px] opacity-40 select-none">
            <span>{isEditing ? 'Esc — готово' : 'Учитывается при AI генерации'}</span>
            <div
              onMouseDown={handleResizeMouseDown}
              className="w-3 h-3 cursor-nwse-resize flex items-center justify-center opacity-60 hover:opacity-100"
              title="Изменить размер"
            >
              ◢
            </div>
          </div>
        </div>

        {/* Custom Context Menu */}
        {contextMenuPos && (
          <div
            style={{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px` }}
            className="fixed z-100 bg-white border border-gray-200 rounded-xl shadow-2xl p-1.5 min-w-[160px] text-xs text-gray-800 animate-in fade-in zoom-in-95 duration-100 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Цвет заметки
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    onUpdateColor(note.id, c.key);
                    setContextMenuPos(null);
                  }}
                  className={`w-5 h-5 rounded-full cursor-pointer hover:scale-110 transition-transform ${
                    c.bgClass
                  } ${note.color === c.key ? 'ring-2 ring-blue-600 shadow-sm' : ''}`}
                  title={c.label}
                />
              ))}
            </div>

            <div className="my-1 border-t border-gray-100" />

            {isAttached && (
              <button
                type="button"
                onClick={() => {
                  onDetach(note.id);
                  setContextMenuPos(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-2 text-gray-700 cursor-pointer"
              >
                <Unlink className="w-3.5 h-3.5 text-gray-500" />
                <span>Открепить от карточки</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
                setContextMenuPos(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-2 text-gray-700 cursor-pointer"
            >
              <MoreVertical className="w-3.5 h-3.5 text-gray-500" />
              <span>Редактировать текст</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onDelete(note.id);
                setContextMenuPos(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-red-50 text-red-600 flex items-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              <span>Удалить заметку</span>
            </button>
          </div>
        )}
      </>
    );
  }
);

NoteItem.displayName = 'NoteItem';
