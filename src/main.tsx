import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { cloudStartup, isCloudEnabled } from './utils/cloud';

// The studio behaves like an app: pinch / ctrl+wheel never zooms the page itself.
// The canvas handles its own zoom; panels and menus simply ignore the gesture.
window.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  },
  { passive: false }
);
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault());
}
// iOS / iPadOS ignore user-scalable=no: block two-finger page zoom; the canvas still gets the touches.
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);

/**
 * With the cloud on, the studio first brings in what other devices changed, then opens.
 * While it only waits for an answer, it can be opened without the cloud.
 */
async function boot() {
  if (isCloudEnabled()) {
    const signal = { aborted: false };
    const box = document.createElement('div');
    box.id = 'cloud-boot';
    box.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font:13px "Instrument Sans Variable",system-ui,sans-serif;color:#0a0a0a;background:#fff';
    const text = document.createElement('div');
    text.textContent = 'Проверяю облако…';
    const skip = document.createElement('button');
    skip.textContent = 'Открыть без облака';
    skip.style.cssText = 'font:inherit;color:#8a8a88;text-decoration:underline;background:none;border:0;cursor:pointer';
    box.append(text, skip);
    document.body.append(box);
    let skipNow: () => void = () => {};
    const skipped = new Promise<void>((resolve) => (skipNow = resolve));
    skip.onclick = () => {
      signal.aborted = true;
      skipNow();
    };
    await Promise.race([
      cloudStartup((msg) => {
        // Data is being written now: wait for it to finish
        skip.remove();
        text.textContent = msg;
      }, signal),
      skipped,
    ]);
    box.remove();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void boot();
