import React, { useState, useRef, useEffect, useCallback } from 'react';

export type CropAspectRatio = 'original' | '1:1' | '4:3' | '3:4' | '4:5' | '16:9' | '9:16' | 'free';

/** Width / height for a crop preset, or null for free cropping and for 'original' (the photo's own ratio, i.e. no crop). */
export function cropRatioValue(r: CropAspectRatio): number | null {
  if (r === 'free' || r === 'original') return null;
  const [w, h] = r.split(':').map(Number);
  return w / h;
}

const CROP_PRESETS: { id: CropAspectRatio; title: string; label?: string }[] = [
  { id: 'original', title: 'Пропорции оригинала', label: 'Оригинал' },
  { id: '1:1', title: 'Квадрат 1:1' },
  { id: '4:3', title: 'Горизонталь 4:3' },
  { id: '3:4', title: 'Вертикаль 3:4' },
  { id: '4:5', title: 'Вертикаль 4:5 (Instagram)' },
  { id: '16:9', title: 'Широкий 16:9' },
  { id: '9:16', title: 'Сторис 9:16' },
];

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  imageName?: string;
  initialAspectRatio?: CropAspectRatio;
  queueInfo?: { current: number; total: number; fileName?: string };
  onSave: (croppedDataUrl: string, width: number, height: number) => void;
  onCancel: () => void;
  onApplyToAllRemaining?: (aspectRatio: CropAspectRatio) => void;
  onSkipAllAndImportOriginals?: () => void;
  onSkipCurrent?: () => void;
}

type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageSrc,
  imageName,
  initialAspectRatio = 'original',
  queueInfo,
  onSave,
  onCancel,
  onApplyToAllRemaining,
  onSkipAllAndImportOriginals,
  onSkipCurrent,
}) => {
  const [aspectRatio, setAspectRatio] = useState<CropAspectRatio>(initialAspectRatio);
  const [rotation, setRotation] = useState<number>(0);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Displayed image layout inside container
  const [imageLayout, setImageLayout] = useState<{
    width: number;
    height: number;
    left: number;
    top: number;
  }>({ width: 0, height: 0, left: 0, top: 0 });

  // Crop box relative to displayed image (0 <= x <= imageLayout.width, etc.)
  const [cropBox, setCropBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({ x: 0, y: 0, width: 0, height: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  // Zoom and pan of the whole picture (image + crop box together), to look closely at an edge
  const [view, setView] = useState<{ z: number; x: number; y: number }>({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const imageRef = useRef<HTMLImageElement>(null);

  // Drag tracking refs
  const dragRef = useRef<{
    active: boolean;
    handle: DragHandle;
    startX: number;
    startY: number;
    startCrop: { x: number; y: number; width: number; height: number };
  }>({
    active: false,
    handle: 'move',
    startX: 0,
    startY: 0,
    startCrop: { x: 0, y: 0, width: 0, height: 0 },
  });

  // Reset state when opening or source changes
  useEffect(() => {
    if (isOpen) {
      setAspectRatio(initialAspectRatio);
      setRotation(0);
      setView({ z: 1, x: 0, y: 0 });
    }
  }, [isOpen, imageSrc, initialAspectRatio]);

  // Load natural image dimensions
  useEffect(() => {
    if (!imageSrc || !isOpen) return;
    const img = new Image();
    img.onload = () => {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageSrc;
  }, [imageSrc, isOpen]);

  // Recalculate image container layout and default crop box
  const updateLayoutAndCrop = useCallback(() => {
    if (!containerRef.current || naturalSize.width === 0 || naturalSize.height === 0) return;

    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    if (containerW <= 0 || containerH <= 0) return;

    // Account for 90 or 270 deg rotation swapping aspect ratio
    const isRotated90 = rotation % 180 !== 0;
    const effNaturalW = isRotated90 ? naturalSize.height : naturalSize.width;
    const effNaturalH = isRotated90 ? naturalSize.width : naturalSize.height;

    const padding = 6;
    const maxW = Math.max(100, containerW - padding * 2);
    const maxH = Math.max(100, containerH - padding * 2);

    const scale = Math.min(maxW / effNaturalW, maxH / effNaturalH, 1.0);
    const dispW = Math.max(50, Math.round(effNaturalW * scale));
    const dispH = Math.max(50, Math.round(effNaturalH * scale));
    const dispLeft = Math.round((containerW - dispW) / 2);
    const dispTop = Math.round((containerH - dispH) / 2);

    setImageLayout({
      width: dispW,
      height: dispH,
      left: dispLeft,
      top: dispTop,
    });

    // Start on the whole photo (or the largest box of the chosen ratio), no margin
    const targetRatio: number | null = aspectRatio === 'original' ? effNaturalW / effNaturalH : cropRatioValue(aspectRatio);

    let cropW = dispW;
    let cropH = dispH;

    if (targetRatio !== null) {
      if (cropW / cropH > targetRatio) {
        cropW = Math.round(cropH * targetRatio);
      } else {
        cropH = Math.round(cropW / targetRatio);
      }
    }

    cropW = Math.max(30, cropW);
    cropH = Math.max(30, cropH);

    const cropX = Math.max(0, Math.round((dispW - cropW) / 2));
    const cropY = Math.max(0, Math.round((dispH - cropH) / 2));

    setCropBox({
      x: cropX,
      y: cropY,
      width: cropW,
      height: cropH,
    });
  }, [naturalSize, rotation, aspectRatio]);

  useEffect(() => {
    if (isOpen && naturalSize.width > 0) {
      updateLayoutAndCrop();
    }
  }, [isOpen, naturalSize, rotation, aspectRatio, updateLayoutAndCrop]);

  // Window resize observer to adapt crop
  useEffect(() => {
    const handleResize = () => {
      updateLayoutAndCrop();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateLayoutAndCrop]);

  /** The ratio to hold for a preset; 'original' = the displayed photo's own ratio */
  const ratioFor = (ratio: CropAspectRatio): number | null =>
    ratio === 'original'
      ? imageLayout.width > 0 && imageLayout.height > 0
        ? imageLayout.width / imageLayout.height
        : null
      : cropRatioValue(ratio);

  // Switch aspect ratio
  const handleSelectAspectRatio = (ratio: CropAspectRatio) => {
    setAspectRatio(ratio);
    if (imageLayout.width === 0 || imageLayout.height === 0) return;
    if (ratio === 'original') {
      setCropBox({ x: 0, y: 0, width: imageLayout.width, height: imageLayout.height });
      return;
    }

    const targetRatio: number | null = cropRatioValue(ratio);

    if (targetRatio === null) {
      return;
    }

    const currentCenterX = cropBox.x + cropBox.width / 2;
    const currentCenterY = cropBox.y + cropBox.height / 2;

    let newW = cropBox.width;
    let newH = Math.round(newW / targetRatio);

    if (newH > imageLayout.height) {
      newH = imageLayout.height;
      newW = Math.round(newH * targetRatio);
    }
    if (newW > imageLayout.width) {
      newW = imageLayout.width;
      newH = Math.round(newW / targetRatio);
    }

    let newX = Math.round(currentCenterX - newW / 2);
    let newY = Math.round(currentCenterY - newH / 2);

    newX = Math.max(0, Math.min(newX, imageLayout.width - newW));
    newY = Math.max(0, Math.min(newY, imageLayout.height - newH));

    setCropBox({
      x: newX,
      y: newY,
      width: newW,
      height: newH,
    });
  };

  // Rotate image 90 deg clockwise
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Pointer drag logic for moving and resizing crop box
  const handlePointerDown = (e: React.PointerEvent, handle: DragHandle) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragRef.current = {
      active: true,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...cropBox },
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active || imageLayout.width === 0 || imageLayout.height === 0) return;
    e.preventDefault();

    const { handle, startX, startY, startCrop } = dragRef.current;
    // Screen pixels → picture pixels when zoomed in
    const dx = (e.clientX - startX) / viewRef.current.z;
    const dy = (e.clientY - startY) / viewRef.current.z;

    const minSize = 20;
    const maxW = imageLayout.width;
    const maxH = imageLayout.height;

    const targetRatio: number | null = ratioFor(aspectRatio);

    if (handle === 'move') {
      let nextX = startCrop.x + dx;
      let nextY = startCrop.y + dy;

      nextX = Math.max(0, Math.min(nextX, maxW - startCrop.width));
      nextY = Math.max(0, Math.min(nextY, maxH - startCrop.height));

      setCropBox({
        ...startCrop,
        x: Math.round(nextX),
        y: Math.round(nextY),
      });
      return;
    }

    let { x, y, width, height } = startCrop;

    if (handle.includes('e')) {
      width = Math.max(minSize, Math.min(startCrop.width + dx, maxW - x));
    }
    if (handle.includes('s')) {
      height = Math.max(minSize, Math.min(startCrop.height + dy, maxH - y));
    }
    if (handle.includes('w')) {
      const allowedDx = Math.min(dx, startCrop.width - minSize);
      const actualDx = Math.max(-startCrop.x, allowedDx);
      x = startCrop.x + actualDx;
      width = startCrop.width - actualDx;
    }
    if (handle.includes('n')) {
      const allowedDy = Math.min(dy, startCrop.height - minSize);
      const actualDy = Math.max(-startCrop.y, allowedDy);
      y = startCrop.y + actualDy;
      height = startCrop.height - actualDy;
    }

    if (targetRatio !== null) {
      if (handle === 'e' || handle === 'w') {
        height = Math.round(width / targetRatio);
        if (y + height > maxH) {
          height = maxH - y;
          width = Math.round(height * targetRatio);
        }
      } else if (handle === 's' || handle === 'n') {
        width = Math.round(height * targetRatio);
        if (x + width > maxW) {
          width = maxW - x;
          height = Math.round(width / targetRatio);
        }
      } else {
        const candidateH = Math.round(width / targetRatio);
        if (candidateH <= maxH - y) {
          height = candidateH;
        } else {
          height = maxH - y;
          width = Math.round(height * targetRatio);
        }
      }
    }

    setCropBox({
      x: Math.round(Math.max(0, Math.min(x, maxW - width))),
      y: Math.round(Math.max(0, Math.min(y, maxH - height))),
      width: Math.round(Math.max(minSize, width)),
      height: Math.round(Math.max(minSize, height)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe ignore
      }
    }
  };

  // Perform the actual crop render and trigger onSave
  const handleSaveCrop = () => {
    if (!imageSrc || naturalSize.width === 0 || naturalSize.height === 0) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let sourceCanvas: HTMLCanvasElement | HTMLImageElement = img;

      if (rotation !== 0) {
        const rotCanvas = document.createElement('canvas');
        const is90 = rotation % 180 !== 0;
        rotCanvas.width = is90 ? img.naturalHeight : img.naturalWidth;
        rotCanvas.height = is90 ? img.naturalWidth : img.naturalHeight;
        const ctxRot = rotCanvas.getContext('2d');
        if (ctxRot) {
          ctxRot.translate(rotCanvas.width / 2, rotCanvas.height / 2);
          ctxRot.rotate((rotation * Math.PI) / 180);
          ctxRot.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
          sourceCanvas = rotCanvas;
        }
      }

      const effNaturalW = sourceCanvas instanceof HTMLCanvasElement ? sourceCanvas.width : img.naturalWidth;
      const effNaturalH = sourceCanvas instanceof HTMLCanvasElement ? sourceCanvas.height : img.naturalHeight;

      const scaleX = effNaturalW / imageLayout.width;
      const scaleY = effNaturalH / imageLayout.height;

      const sx = Math.max(0, Math.round(cropBox.x * scaleX));
      const sy = Math.max(0, Math.round(cropBox.y * scaleY));
      const sw = Math.min(effNaturalW - sx, Math.round(cropBox.width * scaleX));
      const sh = Math.min(effNaturalH - sy, Math.round(cropBox.height * scaleY));

      if (sw <= 0 || sh <= 0) return;

      const maxDim = 1600;
      let outW = sw;
      let outH = sh;
      if (outW > maxDim || outH > maxDim) {
        if (outW >= outH) {
          outH = Math.round((outH * maxDim) / outW);
          outW = maxDim;
        } else {
          outW = Math.round((outW * maxDim) / outH);
          outH = maxDim;
        }
      }

      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) return;

      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';

      outCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

      const croppedDataUrl = outCanvas.toDataURL('image/jpeg', 0.9);
      onSave(croppedDataUrl, outW, outH);
    };
    img.src = imageSrc;
  };

  // Zoom: trackpad pinch / Ctrl+wheel around the cursor, wheel pans when zoomed, Safari gestures, two-finger touch pinch
  const zoomAt = useCallback((nextZ: number, clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const v = viewRef.current;
    const z = Math.min(8, Math.max(1, nextZ));
    if (z === 1) {
      setView({ z: 1, x: 0, y: 0 });
      return;
    }
    const dX = clientX - (r.left + r.width / 2);
    const dY = clientY - (r.top + r.height / 2);
    setView({ z, x: dX - (z / v.z) * (dX - v.x), y: dY - (z / v.z) * (dY - v.y) });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isOpen) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const delta = Math.max(-40, Math.min(40, e.deltaY));
        zoomAt(v.z * Math.exp(-delta * 0.006), e.clientX, e.clientY);
      } else if (v.z > 1) {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    let gestureStartZ = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStartZ = viewRef.current.z;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      zoomAt(gestureStartZ * ge.scale, ge.clientX, ge.clientY);
    };
    let pinch: { dist: number; z: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { dist: dist(e.touches), z: viewRef.current.z };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch) {
        e.preventDefault();
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        zoomAt(pinch.z * (dist(e.touches) / pinch.dist), cx, cy);
      }
    };
    const onTouchEnd = () => {
      pinch = null;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart as EventListener, { passive: false } as AddEventListenerOptions);
    el.addEventListener('gesturechange', onGestureChange as EventListener, { passive: false } as AddEventListenerOptions);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart as EventListener);
      el.removeEventListener('gesturechange', onGestureChange as EventListener);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [isOpen, zoomAt]);

  // Enter saves, Esc closes
  const saveRef = useRef<() => void>(() => {});
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveRef.current();
      } else if (e.key === 'Escape') {
        cancelRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);
  saveRef.current = handleSaveCrop;

  if (!isOpen) return null;

  const isCropTooSmall = cropBox.width < 20 || cropBox.height < 20;
  const isBatch = queueInfo && queueInfo.total > 1;
  const remainingCount = isBatch ? queueInfo.total - queueInfo.current + 1 : 1;

  return (
    <div
      id="image-crop-modal-backdrop"
      className="fixed inset-0 z-50 flex bg-white select-none ofst-fade"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        id="image-crop-modal-card"
        className="bg-white text-[var(--fg)] w-full h-full flex flex-col overflow-hidden p-2 gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Running line: what, which one, file */}
        <div className="ofst-run shrink-0">
          <span>Кадрирование{isBatch ? ` · ${queueInfo.current} из ${queueInfo.total}` : ''}</span>
          <span className="truncate max-w-[60%]">{imageName || queueInfo?.fileName || 'выбери область'}</span>
        </div>

        {/* One row of cells: ratios, rotate, batch actions, close */}
        <div className="flex flex-wrap items-center gap-0 shrink-0">
          {CROP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleSelectAspectRatio(preset.id)}
              className={`ofst-cell ${aspectRatio === preset.id ? 'is-on' : ''}`}
              title={preset.title}
            >
              {preset.label || preset.id}
            </button>
          ))}
          <button
            onClick={() => handleSelectAspectRatio('free')}
            className={`ofst-cell ${aspectRatio === 'free' ? 'is-on' : ''}`}
            title="Свободные пропорции"
          >
            Свободно
          </button>
          <button onClick={handleRotate} className="ofst-cell" title="Повернуть на 90°">
            Повернуть
          </button>
          <span className="w-2" />
          <button onClick={() => { const r = containerRef.current?.getBoundingClientRect(); if (r) zoomAt(view.z / 1.5, r.left + r.width / 2, r.top + r.height / 2); }} className="ofst-cell w-7" title="Отдалить">
            −
          </button>
          <button onClick={() => setView({ z: 1, x: 0, y: 0 })} className="ofst-cell tabular-nums" title="Вписать (двойной клик по фону)">
            {Math.round(view.z * 100)}%
          </button>
          <button onClick={() => { const r = containerRef.current?.getBoundingClientRect(); if (r) zoomAt(view.z * 1.5, r.left + r.width / 2, r.top + r.height / 2); }} className="ofst-cell w-7" title="Приблизить (или щипок на трекпаде)">
            +
          </button>
          <span className="flex-1" />
          {isBatch && onApplyToAllRemaining && (
            <button
              onClick={() => onApplyToAllRemaining(aspectRatio)}
              className="ofst-cell"
              title="Применить текущую пропорцию ко всем оставшимся фото"
            >
              {aspectRatio === 'free' ? 'Так же' : aspectRatio} ко всем ({remainingCount})
            </button>
          )}
          {isBatch && onSkipAllAndImportOriginals && (
            <button onClick={onSkipAllAndImportOriginals} className="ofst-cell ofst-cell--muted" title="Импортировать все фото без обрезки">
              Все без обрезки
            </button>
          )}
          <button onClick={onCancel} className="ofst-cell ofst-cell--muted" title="Отмена">
            Закрыть
          </button>
        </div>

        {/* Main Crop Viewport */}
        <div
          ref={containerRef}
          id="crop-viewport-container"
          style={{ touchAction: 'none' }}
          className="relative flex-1 min-h-0 bg-[var(--soft)] flex items-center justify-center overflow-hidden select-none"
          onDoubleClick={(e) => {
            if (e.target === e.currentTarget) setView({ z: 1, x: 0, y: 0 });
          }}
        >
          {imageSrc && imageLayout.width > 0 && (
            <div
              className="relative select-none"
              style={{
                width: imageLayout.width,
                height: imageLayout.height,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
                transition: 'transform 60ms linear',
              }}
            >
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Crop preview"
                className="w-full h-full object-contain pointer-events-none transition-transform duration-150"
                style={{
                  transform: `rotate(${rotation}deg)`,
                }}
                draggable={false}
              />

              {/* Paper over what gets cut away */}
              <div className="absolute bg-white/70 pointer-events-none" style={{ left: 0, top: 0, width: '100%', height: cropBox.y }} />
              <div className="absolute bg-white/70 pointer-events-none" style={{ left: 0, top: cropBox.y + cropBox.height, width: '100%', height: Math.max(0, imageLayout.height - (cropBox.y + cropBox.height)) }} />
              <div className="absolute bg-white/70 pointer-events-none" style={{ left: 0, top: cropBox.y, width: cropBox.x, height: cropBox.height }} />
              <div className="absolute bg-white/70 pointer-events-none" style={{ left: cropBox.x + cropBox.width, top: cropBox.y, width: Math.max(0, imageLayout.width - (cropBox.x + cropBox.width)), height: cropBox.height }} />

              <div
                id="active-crop-box"
                className="absolute border border-[var(--fg)] cursor-move touch-none group"
                style={{
                  left: cropBox.x,
                  top: cropBox.y,
                  width: cropBox.width,
                  height: cropBox.height,
                }}
                onPointerDown={(e) => handlePointerDown(e, 'move')}
              >
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-0 group-hover:opacity-60 transition-opacity">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className={`${i % 3 < 2 ? 'border-r' : ''} ${i < 6 ? 'border-b' : ''} border-white`} />
                  ))}
                </div>
                <div
                  className="absolute -top-1 -left-1 w-2 h-2 cursor-nwse-resize bg-white border border-[var(--fg)]"
                  onPointerDown={(e) => handlePointerDown(e, 'nw')}
                />
                <div
                  className="absolute -top-1 -right-1 w-2 h-2 cursor-nesw-resize bg-white border border-[var(--fg)]"
                  onPointerDown={(e) => handlePointerDown(e, 'ne')}
                />
                <div
                  className="absolute -bottom-1 -left-1 w-2 h-2 cursor-nesw-resize bg-white border border-[var(--fg)]"
                  onPointerDown={(e) => handlePointerDown(e, 'sw')}
                />
                <div
                  className="absolute -bottom-1 -right-1 w-2 h-2 cursor-nwse-resize bg-white border border-[var(--fg)]"
                  onPointerDown={(e) => handlePointerDown(e, 'se')}
                />
                <div
                  className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-5 cursor-ew-resize bg-white border border-[var(--fg)]"
                  onPointerDown={(e) => handlePointerDown(e, 'w')}
                />
                <div
                  className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-5 cursor-ew-resize bg-white border border-[var(--fg)]"
                  onPointerDown={(e) => handlePointerDown(e, 'e')}
                />
                <div
                  className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-2 cursor-ns-resize bg-white border border-[var(--fg)]"
                  onPointerDown={(e) => handlePointerDown(e, 'n')}
                />
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-2 cursor-ns-resize bg-white border border-[var(--fg)]"
                  onPointerDown={(e) => handlePointerDown(e, 's')}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer: skip / cancel left, save right */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center">
            {isBatch && onSkipCurrent && (
              <button onClick={onSkipCurrent} className="ofst-cell ofst-cell--muted" title="Пропустить это фото и перейти к следующему">
                Пропустить фото
              </button>
            )}
            {!isBatch && (
              <button onClick={onCancel} className="ofst-cell ofst-cell--muted">
                Отмена
              </button>
            )}
          </div>
          <button onClick={handleSaveCrop} disabled={isCropTooSmall} className="ofst-cell ofst-cell--primary">
            {isBatch && queueInfo.current < queueInfo.total ? 'Сохранить и дальше' : 'Готово'}
          </button>
        </div>
      </div>
    </div>
  );
};
