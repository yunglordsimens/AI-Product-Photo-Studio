import React, { useEffect, useRef, useState } from 'react';
import { BoardMatrix, Card } from '../types';
import { MATRIX_LABEL_H, MATRIX_LABEL_W, matrixHeight, matrixWidth, membersOf } from '../utils/matrix';

export interface MatrixApi {
  update: (m: BoardMatrix) => void;
  remove: (id: string) => void;
  transpose: (id: string) => void;
  toPositions: (id: string) => void;
  addLine: (id: string, axis: 'rows' | 'cols') => void;
  removeLine: (id: string, axis: 'rows' | 'cols', idx: number) => void;
  /** Total offset from where the drag started, in board units */
  drag: (id: string, dx: number, dy: number, phase: 'start' | 'move' | 'end') => void;
}

const stop = {
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
};

function Label({ text, strong, onRename, onRemove }: { text: string; strong?: boolean; onRename: (t: string) => void; onRemove?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(text);
  useEffect(() => setVal(text), [text]);
  const finish = (keep: boolean) => {
    setEditing(false);
    if (keep && val.trim() && val.trim() !== text) onRename(val.trim());
    else setVal(text);
  };
  return (
    <div className="group/lbl flex items-baseline gap-1 min-w-0 text-[12px] leading-4 pointer-events-auto" {...stop}>
      {editing ? (
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') finish(true);
            if (e.key === 'Escape') finish(false);
          }}
          className="h-4 px-0.5 bg-white min-w-0 w-full text-[12px] select-text"
        />
      ) : (
        <span
          className={`truncate cursor-text ${strong ? 'font-medium text-[var(--fg)]' : 'text-[var(--grey)]'}`}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          title="Нажми, чтобы переименовать"
        >
          {text}
        </span>
      )}
      {onRemove && !editing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hidden group-hover/lbl:inline text-[var(--grey)] hover:text-[var(--fg)] shrink-0"
          title="Убрать линию (фото останутся на доске)"
        >
          ×
        </button>
      )}
    </div>
  );
}

export const BoardMatrixView: React.FC<{ matrix: BoardMatrix; cards: Card[]; zoom: number; api: MatrixApi; dimmed?: boolean }> = ({
  matrix: m,
  cards,
  zoom,
  api,
  dimmed,
}) => {
  const W = matrixWidth(m);
  const H = matrixHeight(m);
  const filled = membersOf(m, cards).size;
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const startDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { x: e.clientX, y: e.clientY };
    api.drag(m.id, 0, 0, 'start');
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      api.drag(m.id, (ev.clientX - dragRef.current.x) / zoom, (ev.clientY - dragRef.current.y) / zoom, 'move');
    };
    const up = (ev: MouseEvent) => {
      if (dragRef.current) api.drag(m.id, (ev.clientX - dragRef.current.x) / zoom, (ev.clientY - dragRef.current.y) / zoom, 'end');
      dragRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const productsRows = m.productsAlong === 'rows';
  const rename = (axis: 'rows' | 'cols', i: number) => (t: string) => api.update({ ...m, [axis]: m[axis].map((x, k) => (k === i ? t : x)) });

  return (
    <div
      id={`matrix-${m.id}`}
      className="absolute top-0 left-0 pointer-events-none select-none"
      style={{
        transform: `translate3d(${m.x - MATRIX_LABEL_W}px, ${m.y - MATRIX_LABEL_H}px, 0)`,
        width: MATRIX_LABEL_W + W,
        height: MATRIX_LABEL_H + H,
        zIndex: 0,
        opacity: dimmed ? 0.15 : 1,
      }}
    >
      {/* Bar above: name, what the axes mean, actions */}
      <div className="absolute left-0 -top-7 h-6 flex items-center gap-2 text-[12px] whitespace-nowrap pointer-events-auto" {...stop}>
        <span onMouseDown={startDrag} className="px-1 h-5 inline-flex items-center bg-[var(--fg)] text-white cursor-grab active:cursor-grabbing" title="Перетащить сетку вместе с фото">
          ⠿ Оси
        </span>
        <span className="text-[var(--grey)]">
          товары — {productsRows ? 'строки' : 'столбцы'}, ракурсы — {productsRows ? 'столбцы' : 'строки'} · фото {filled}
        </span>
        <button onClick={() => api.addLine(m.id, productsRows ? 'rows' : 'cols')} className="underline hover:bg-[var(--soft)]">
          + товар
        </button>
        <button onClick={() => api.addLine(m.id, productsRows ? 'cols' : 'rows')} className="underline hover:bg-[var(--soft)]">
          + ракурс
        </button>
        <button onClick={() => api.transpose(m.id)} className="underline hover:bg-[var(--soft)]" title="Поменять оси местами: строки ⇄ столбцы">
          ⇄ оси
        </button>
        <button
          onClick={() => api.toPositions(m.id)}
          disabled={filled === 0}
          className="px-1 bg-[var(--fg)] text-white hover:bg-[var(--marker)] hover:text-[var(--fg)] disabled:opacity-40"
          title="Каждый товар станет позицией: фото по ракурсам лягут в колонки"
        >
          → в позиции
        </button>
        <button
          onClick={() => {
            if (window.confirm('Убрать сетку? Фото останутся на доске.')) api.remove(m.id);
          }}
          className="text-[var(--grey)] underline hover:text-[var(--fg)]"
        >
          убрать
        </button>
      </div>

      {/* Column labels */}
      {m.cols.map((label, c) => (
        <div key={`c${c}`} className="absolute top-0 h-7 px-1 flex items-end pb-1" style={{ left: MATRIX_LABEL_W + c * m.cellW, width: m.cellW }}>
          <Label text={label} strong={!productsRows} onRename={rename('cols', c)} onRemove={m.cols.length > 1 ? () => api.removeLine(m.id, 'cols', c) : undefined} />
        </div>
      ))}
      {/* Row labels */}
      {m.rows.map((label, r) => (
        <div key={`r${r}`} className="absolute left-0 px-1 pt-1" style={{ top: MATRIX_LABEL_H + r * m.cellH, width: MATRIX_LABEL_W, height: m.cellH }}>
          <Label text={label} strong={productsRows} onRename={rename('rows', r)} onRemove={m.rows.length > 1 ? () => api.removeLine(m.id, 'rows', r) : undefined} />
        </div>
      ))}
      {/* Cells */}
      <div
        className="absolute"
        style={{
          left: MATRIX_LABEL_W,
          top: MATRIX_LABEL_H,
          width: W,
          height: H,
          backgroundColor: 'rgba(255,255,255,.55)',
          backgroundImage:
            'linear-gradient(to right, var(--soft-2) 1px, transparent 1px), linear-gradient(to bottom, var(--soft-2) 1px, transparent 1px)',
          backgroundSize: `${m.cellW}px ${m.cellH}px`,
          boxShadow: 'inset -1px -1px 0 var(--soft-2)',
        }}
      />
      {/* The product lines get a darker rule, so it is clear which way a product runs */}
      {(productsRows ? m.rows : m.cols).map((_, i) =>
        productsRows ? (
          <div key={`l${i}`} className="absolute bg-[var(--fg)]" style={{ left: 0, width: MATRIX_LABEL_W + W, top: MATRIX_LABEL_H + i * m.cellH, height: 1 }} />
        ) : (
          <div key={`l${i}`} className="absolute bg-[var(--fg)]" style={{ top: 0, height: MATRIX_LABEL_H + H, left: MATRIX_LABEL_W + i * m.cellW, width: 1 }} />
        )
      )}
    </div>
  );
};
