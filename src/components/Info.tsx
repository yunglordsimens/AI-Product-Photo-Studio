import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * «i» in a circle: hover (or tap on a phone) shows a short explanation.
 * The note is drawn on top of everything, so a scrolling column or the zoomed board never cuts it off.
 */
export function Info({ children, up = false }: { children: React.ReactNode; align?: 'left' | 'right'; up?: boolean }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const show = () => btn.current && setRect(btn.current.getBoundingClientRect());
  const hide = () => setRect(null);
  const W = 280;
  let style: React.CSSProperties | undefined;
  if (rect) {
    const left = Math.max(8, Math.min(rect.left - 6, window.innerWidth - W - 8));
    const below = !up && rect.bottom + 160 < window.innerHeight;
    style = below ? { left, top: rect.bottom + 6 } : { left, bottom: window.innerHeight - rect.top + 6 };
  }
  return (
    <span className={`ofst-info ${rect ? 'is-open' : ''}`} onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={btn}
        type="button"
        aria-label="Что это"
        onClick={(e) => {
          e.stopPropagation();
          if (rect) hide();
          else show();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        i
      </button>
      {rect &&
        createPortal(
          <span role="tooltip" className="ofst-info-note" style={{ ...style, maxWidth: W }}>
            {children}
          </span>,
          document.body
        )}
    </span>
  );
}
