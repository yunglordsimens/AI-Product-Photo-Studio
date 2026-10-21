/**
 * Puts a picture on the system clipboard (PNG, so other apps accept it) together with a text marker.
 * Best effort: browsers without permission or support simply keep the text marker set by the copy event.
 */
export async function copyPictureToSystem(src: string, marker: string): Promise<void> {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return;
    const png = await new Promise<Blob | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')?.drawImage(img, 0, 0);
        canvas.toBlob((b) => resolve(b), 'image/png');
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
    if (!png) return;
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': png, 'text/plain': new Blob([marker], { type: 'text/plain' }) }),
    ]);
  } catch {
    // Permission denied or unsupported: the marker from the copy event is still there
  }
}
