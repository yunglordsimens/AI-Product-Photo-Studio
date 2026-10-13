/**
 * iPhone photos often arrive as HEIC/HEIF. Only Safari can show them, and Chrome
 * gives them an empty MIME type, so they used to be silently skipped on drop.
 * Here they are converted to JPEG before being added anywhere.
 */
const HEIC_EXT = /\.(heic|heif)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif|heic|heif)$/i;

export function isHeicFile(f: File): boolean {
  return /image\/hei[cf]/i.test(f.type) || HEIC_EXT.test(f.name);
}

/** True for anything we can turn into an image, including HEIC with no MIME type. */
export function isImageFile(f: File): boolean {
  return f.type.startsWith('image/') || IMAGE_EXT.test(f.name);
}

/** Converts HEIC/HEIF files to JPEG; other files pass through unchanged. */
export async function normalizeImageFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    if (!isHeicFile(f)) {
      out.push(f);
      continue;
    }
    try {
      const { heicTo } = await import('heic-to');
      const blob = await heicTo({ blob: f, type: 'image/jpeg', quality: 0.92 });
      out.push(new File([blob], f.name.replace(HEIC_EXT, '.jpg'), { type: 'image/jpeg' }));
    } catch (err) {
      console.error('HEIC conversion failed', f.name, err);
    }
  }
  return out;
}
