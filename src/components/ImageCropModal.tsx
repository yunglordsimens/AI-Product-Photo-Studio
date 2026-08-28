import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Check,
  RotateCw,
  Maximize2,
  Square,
  RectangleHorizontal,
  Crop,
  Layers,
  Sparkles,
} from 'lucide-react';

export type CropAspectRatio = '1:1' | '4:3' | '16:9' | 'free';

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  imageName?: string;
  initialAspectRatio?: CropAspectRatio;
  queueInfo?: { current: number; total: number; fileName?: string };
  onSave: (croppedDataUrl: string, width: number, height: number) => void;
  onCancel: () => void;
}

type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageSrc,
  imageName,
  initialAspectRatio = '1:1',
  queueInfo,
  onSave,
  onCancel,
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

    const padding = 24;
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

    // Initialize crop box according to aspect ratio
    let targetRatio: number | null = null;
    if (aspectRatio === '1:1') targetRatio = 1.0;
    else if (aspectRatio === '4:3') targetRatio = 4 / 3;
    else if (aspectRatio === '16:9') targetRatio = 16 / 9;

    let cropW = dispW;
    let cropH = dispH;

    if (targetRatio !== null) {
      if (cropW / cropH > targetRatio) {
        // Image is wider than ratio
        cropW = Math.round(cropH * targetRatio);
      } else {
        // Image is taller than ratio
        cropH = Math.round(cropW / targetRatio);
      }
    }

    // Shrink slightly (e.g. 90% of max fitting area) for aesthetic margins
    const marginScale = 0.92;
    cropW = Math.max(30, Math.round(cropW * marginScale));
    cropH = Math.max(30, Math.round(cropH * marginScale));
    if (targetRatio !== null) {
      if (cropW / cropH > targetRatio) {
        cropW = Math.round(cropH * targetRatio);
      } else {
        cropH = Math.round(cropW / targetRatio);
      }
    }

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

  // Switch aspect ratio
  const handleSelectAspectRatio = (ratio: CropAspectRatio) => {
    setAspectRatio(ratio);
    if (imageLayout.width === 0 || imageLayout.height === 0) return;

    let targetRatio: number | null = null;
    if (ratio === '1:1') targetRatio = 1.0;
    else if (ratio === '4:3') targetRatio = 4 / 3;
    else if (ratio === '16:9') targetRatio = 16 / 9;

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
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const minSize = 20;
    const maxW = imageLayout.width;
    const maxH = imageLayout.height;

    let targetRatio: number | null = null;
    if (aspectRatio === '1:1') targetRatio = 1.0;
    else if (aspectRatio === '4:3') targetRatio = 4 / 3;
    else if (aspectRatio === '16:9') targetRatio = 16 / 9;

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

    // Maintain ratio if preset is selected
    if (targetRatio !== null) {
      if (handle === 'e' || handle === 'w' || handle === 'se' || handle === 'sw') {
        height = Math.round(width / targetRatio);
        if (y + height > maxH) {
          height = maxH - y;
          width = Math.round(height * targetRatio);
        }
      } else if (handle === 'n' || handle === 's' || handle === 'ne' || handle === 'nw') {
        width = Math.round(height * targetRatio);
        if (x + width > maxW) {
          width = maxW - x;
          height = Math.round(width / targetRatio);
        }
      }
    }

    // Final boundary checks
    width = Math.max(minSize, Math.min(width, maxW - x));
    height = Math.max(minSize, Math.min(height, maxH - y));

    setCropBox({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  // Perform crop & save
  const handleSaveCrop = () => {
    if (
      cropBox.width < 20 ||
      cropBox.height < 20 ||
      naturalSize.width === 0 ||
      naturalSize.height === 0 ||
      imageLayout.width === 0
    ) {
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // 1. Create intermediate canvas to handle rotation if needed
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

      // Scale from displayed px to natural px
      const scaleX = effNaturalW / imageLayout.width;
      const scaleY = effNaturalH / imageLayout.height;

      const sx = Math.max(0, Math.round(cropBox.x * scaleX));
      const sy = Math.max(0, Math.round(cropBox.y * scaleY));
      const sw = Math.min(effNaturalW - sx, Math.round(cropBox.width * scaleX));
      const sh = Math.min(effNaturalH - sy, Math.round(cropBox.height * scaleY));

      if (sw <= 0 || sh <= 0) return;

      // Target max dimension: 800px
      const maxDim = 800;
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

      // Smoothing
      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';

      outCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

      const croppedDataUrl = outCanvas.toDataURL('image/jpeg', 0.85);
      onSave(croppedDataUrl, outW, outH);
    };
    img.src = imageSrc;
  };

  if (!isOpen) return null;

  const isCropTooSmall = cropBox.width < 20 || cropBox.height < 20;

  return (
    <div
      id="image-crop-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 md:p-6 select-none animate-fade-in"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        id="image-crop-modal-card"
        className="bg-gray-900 border border-gray-800 text-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Crop size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm sm:text-base text-gray-100">
                  Обрезка изображения
                </h3>
                {queueInfo && queueInfo.total > 1 && (
                  <span className="text-xs bg-blue-500/20 text-blue-300 font-medium px-2 py-0.5 rounded-full border border-blue-500/30">
                    {queueInfo.current} из {queueInfo.total}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 truncate max-w-xs sm:max-w-md">
                {imageName || queueInfo?.fileName || 'Настройте область обрезки'}
              </p>
            </div>
          </div>

          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            title="Отмена"
          >
            <X size={20} />
          </button>
        </div>

        {/* Aspect Ratio Toolbar & Controls */}
        <div className="px-4 sm:px-6 py-2.5 bg-gray-950/60 border-b border-gray-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Aspect ratio buttons */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-gray-900 p-1 rounded-xl border border-gray-800">
            <button
              onClick={() => handleSelectAspectRatio('1:1')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                aspectRatio === '1:1'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
              title="Квадрат 1:1 (для карточки продукта)"
            >
              <Square size={13} />
              <span>1:1</span>
            </button>

            <button
              onClick={() => handleSelectAspectRatio('4:3')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                aspectRatio === '4:3'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
              title="Формат 4:3"
            >
              <RectangleHorizontal size={13} />
              <span>4:3</span>
            </button>

            <button
              onClick={() => handleSelectAspectRatio('16:9')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                aspectRatio === '16:9'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
              title="Широкоформатный 16:9"
            >
              <RectangleHorizontal size={14} className="scale-x-125" />
              <span>16:9</span>
            </button>

            <button
              onClick={() => handleSelectAspectRatio('free')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                aspectRatio === 'free'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
              title="Свободные пропорции"
            >
              <Maximize2 size={13} />
              <span>Свободное</span>
            </button>
          </div>

          {/* Extra tools: Rotate */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRotate}
              className="flex items-center gap-1.5 px-3 py-1 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white rounded-xl text-xs font-medium transition-colors"
              title="Повернуть на 90°"
            >
              <RotateCw size={14} />
              <span className="hidden sm:inline">Повернуть</span>
            </button>

            <span className="text-xs text-gray-500 font-mono hidden md:inline">
              {cropBox.width > 0 ? `${cropBox.width}×${cropBox.height}px` : ''}
            </span>
          </div>
        </div>

        {/* Main Crop Viewport (max 70vh) */}
        <div
          ref={containerRef}
          id="crop-viewport-container"
          className="relative flex-1 min-h-[280px] max-h-[66vh] sm:max-h-[70vh] bg-black/95 flex items-center justify-center overflow-hidden p-4 select-none touch-none"
        >
          {imageSrc && imageLayout.width > 0 && (
            <div
              className="relative select-none"
              style={{
                width: imageLayout.width,
                height: imageLayout.height,
              }}
            >
              {/* Displayed Image */}
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

              {/* Shading outside crop box (top, bottom, left, right) */}
              <div
                className="absolute bg-black/60 pointer-events-none"
                style={{
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: cropBox.y,
                }}
              />
              <div
                className="absolute bg-black/60 pointer-events-none"
                style={{
                  left: 0,
                  top: cropBox.y + cropBox.height,
                  width: '100%',
                  height: Math.max(0, imageLayout.height - (cropBox.y + cropBox.height)),
                }}
              />
              <div
                className="absolute bg-black/60 pointer-events-none"
                style={{
                  left: 0,
                  top: cropBox.y,
                  width: cropBox.x,
                  height: cropBox.height,
                }}
              />
              <div
                className="absolute bg-black/60 pointer-events-none"
                style={{
                  left: cropBox.x + cropBox.width,
                  top: cropBox.y,
                  width: Math.max(0, imageLayout.width - (cropBox.x + cropBox.width)),
                  height: cropBox.height,
                }}
              />

              {/* Interactive Crop Box */}
              <div
                id="active-crop-box"
                className="absolute border-2 border-blue-400 cursor-move shadow-2xl touch-none group"
                style={{
                  left: cropBox.x,
                  top: cropBox.y,
                  width: cropBox.width,
                  height: cropBox.height,
                }}
                onPointerDown={(e) => handlePointerDown(e, 'move')}
              >
                {/* 3x3 Rule of Thirds Grid Lines */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity">
                  <div className="border-r border-b border-white/50" />
                  <div className="border-r border-b border-white/50" />
                  <div className="border-b border-white/50" />
                  <div className="border-r border-b border-white/50" />
                  <div className="border-r border-b border-white/50" />
                  <div className="border-b border-white/50" />
                  <div className="border-r border-white/50" />
                  <div className="border-r border-white/50" />
                  <div />
                </div>

                {/* 4 Corner Resize Handles */}
                <div
                  className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-500 rounded-xs cursor-nwse-resize shadow-md"
                  onPointerDown={(e) => handlePointerDown(e, 'nw')}
                />
                <div
                  className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-500 rounded-xs cursor-nesw-resize shadow-md"
                  onPointerDown={(e) => handlePointerDown(e, 'ne')}
                />
                <div
                  className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-500 rounded-xs cursor-nesw-resize shadow-md"
                  onPointerDown={(e) => handlePointerDown(e, 'sw')}
                />
                <div
                  className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-500 rounded-xs cursor-nwse-resize shadow-md"
                  onPointerDown={(e) => handlePointerDown(e, 'se')}
                />

                {/* 4 Edge Resize Handles */}
                <div
                  className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-5 bg-white border border-blue-500 rounded-xs cursor-ew-resize opacity-80 hover:opacity-100"
                  onPointerDown={(e) => handlePointerDown(e, 'w')}
                />
                <div
                  className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-5 bg-white border border-blue-500 rounded-xs cursor-ew-resize opacity-80 hover:opacity-100"
                  onPointerDown={(e) => handlePointerDown(e, 'e')}
                />
                <div
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-3 bg-white border border-blue-500 rounded-xs cursor-ns-resize opacity-80 hover:opacity-100"
                  onPointerDown={(e) => handlePointerDown(e, 'n')}
                />
                <div
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-3 bg-white border border-blue-500 rounded-xs cursor-ns-resize opacity-80 hover:opacity-100"
                  onPointerDown={(e) => handlePointerDown(e, 's')}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-t border-gray-800 bg-gray-950/80 shrink-0">
          <div className="text-xs text-gray-400">
            Перетащите рамку или потяните за углы для изменения размера
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onCancel}
              className="px-3.5 sm:px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 hover:text-white rounded-xl text-xs sm:text-sm font-medium transition-colors"
            >
              Отмена
            </button>

            <button
              onClick={handleSaveCrop}
              disabled={isCropTooSmall}
              className="flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-xl text-xs sm:text-sm font-medium transition-all shadow-md shadow-blue-600/20 active:scale-95"
            >
              <Check size={16} />
              <span>Сохранить обрезку</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
