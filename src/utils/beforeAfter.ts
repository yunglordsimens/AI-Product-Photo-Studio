/**
 * A before / after picture in the OFST look: white paper, two photos side by side with no gap,
 * a running line on top (small text standing on a 1px rule), the name at the bottom.
 * 2160 × 1350 by default: each half is 4:5, so it reads well on a site and in a report.
 */
const FONT = '"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось открыть фото'));
    img.src = src;
  });
}

/** Draw `img` to fill the box, cropping the overflow from the centre */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

export async function renderBeforeAfter(
  beforeSrc: string,
  afterSrc: string,
  opts: { title: string; studio?: string; width?: number; height?: number }
): Promise<Blob> {
  const W = opts.width || 2160;
  const H = opts.height || 1350;
  try {
    await document.fonts.load(`500 32px ${FONT}`);
  } catch {
    // system font is fine
  }
  const [before, after] = await Promise.all([loadImage(beforeSrc), loadImage(afterSrc)]);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const pad = Math.round(W * 0.012);
  const fs = Math.round(W * 0.0115);
  const headH = fs * 2.2;
  const footH = fs * 2.4;
  const photoY = pad + headH;
  const photoH = H - photoY - footH - pad;
  const half = (W - pad * 2) / 2;

  // Running line: labels standing on a 1px rule
  ctx.fillStyle = '#0a0a0a';
  ctx.font = `500 ${fs}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  const ruleY = pad + headH - fs * 0.5;
  ctx.fillText('до', pad, ruleY - fs * 0.25);
  ctx.fillText('после', pad + half, ruleY - fs * 0.25);
  ctx.fillStyle = '#6a6a6a';
  const studio = opts.studio || 'OFST';
  ctx.fillText(studio, W - pad - ctx.measureText(studio).width, ruleY - fs * 0.25);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(pad, ruleY, W - pad * 2, Math.max(1, Math.round(W / 2160)));

  drawCover(ctx, before, pad, photoY, half, photoH);
  drawCover(ctx, after, pad + half, photoY, half, photoH);

  // Name under the photos
  ctx.fillStyle = '#0a0a0a';
  ctx.font = `500 ${Math.round(fs * 1.25)}px ${FONT}`;
  ctx.fillText(opts.title, pad, H - pad - fs * 0.4);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось собрать картинку'))), 'image/jpeg', 0.92)
  );
}
