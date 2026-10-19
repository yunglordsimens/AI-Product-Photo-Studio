import React, { useEffect, useRef, useState } from 'react';

interface DockSlotProps {
  id: string;
  open: boolean;
  width: number;
  minWidth: number;
  maxWidth?: number;
  onResize: (width: number) => void;
  /** Called after the closing animation, so the dock can drop the slot */
  onClosed: () => void;
  children: React.ReactNode;
}

/**
 * One panel in the right dock. Opening widens it from zero, so the panels next to it are pushed aside
 * smoothly; closing narrows it back. The left edge can be dragged to make the panel wider or narrower.
 */
export const DockSlot: React.FC<DockSlotProps> = ({ id, open, width, minWidth, maxWidth = 1200, onResize, onClosed, children }) => {
  const [expanded, setExpanded] = useState(false);
  const [resizing, setResizing] = useState(false);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  // Expand on the next frame after mounting, so the width change animates
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => setExpanded(true));
      return () => cancelAnimationFrame(raf);
    }
    setExpanded(false);
    const t = window.setTimeout(() => onClosedRef.current(), 300);
    return () => window.clearTimeout(t);
  }, [open]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    setResizing(true);
    const move = (ev: PointerEvent) => {
      onResize(Math.round(Math.min(maxWidth, Math.max(minWidth, startW + (startX - ev.clientX)))));
    };
    const up = () => {
      setResizing(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      className={`ofst-dock-slot ofst-dock-slot--${id} relative h-full shrink overflow-hidden snap-end ${resizing ? '' : 'ofst-dock-anim'}`}
      style={{ width: expanded ? width : 0, minWidth: expanded ? minWidth : 0 }}
    >
      {/* Inner column keeps its size while the slot animates, so text never reflows mid-motion */}
      <div className="h-full" style={{ width: '100%', minWidth }}>
        {children}
      </div>
      <div
        onPointerDown={startResize}
        onDoubleClick={() => onResize(Math.max(minWidth, Math.min(maxWidth, width === minWidth ? 640 : minWidth)))}
        className="ofst-dock-handle hidden md:block"
        title="Потяни, чтобы сделать шире или уже"
      />
    </div>
  );
};
