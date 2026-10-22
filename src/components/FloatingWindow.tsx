import React, { useEffect, useRef, useState } from 'react';

/**
 * A window that floats over the studio: no dark backdrop, a thin grey edge, dragged by its title line.
 * Its place is remembered per window in this browser.
 */
export function FloatingWindow({
  id,
  title,
  meta,
  width,
  onClose,
  children,
  className = '',
  zIndex = 55,
}: {
  id: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  width: number;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  zIndex?: number;
}) {
  const key = `aips_win_${id}`;
  const clamp = (x: number, y: number) => {
    const w = Math.min(width, window.innerWidth - 16);
    return {
      x: Math.max(8, Math.min(x, window.innerWidth - w - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - 80)),
    };
  };
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && typeof saved.x === 'number') return clamp(saved.x, saved.y);
    } catch {
      /* ignore */
    }
    return clamp((window.innerWidth - width) / 2, Math.max(56, window.innerHeight * 0.08));
  });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const latest = useRef(pos);
  latest.current = pos;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    e.preventDefault();
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      setPos(clamp(ev.clientX - drag.current.dx, ev.clientY - drag.current.dy));
    };
    const up = () => {
      drag.current = null;
      try {
        localStorage.setItem(key, JSON.stringify(latest.current));
      } catch {
        /* private mode */
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      role="dialog"
      aria-label={typeof title === 'string' ? title : undefined}
      className={`ofst-window fixed bg-white text-[var(--fg)] p-2 ofst-pop ${className}`}
      style={{ left: pos.x, top: pos.y, width: `min(${width}px, calc(100vw - 16px))`, zIndex }}
    >
      <div className="ofst-run shrink-0 cursor-grab active:cursor-grabbing select-none" onPointerDown={onPointerDown} title="Перетащи окно за эту строку">
        <span>{title}</span>
        {meta !== undefined && <span>{meta}</span>}
        <button onClick={onClose} className="ofst-x" aria-label="Закрыть" title="Закрыть (Esc)">
          ×
        </button>
      </div>
      {children}
    </div>
  );
}
