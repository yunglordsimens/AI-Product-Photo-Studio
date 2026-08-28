/**
 * Image processing utilities for AI Product Photo Studio
 */

export async function compressAndLoadImage(
  file: File,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.85
): Promise<{ src: string; width: number; height: number; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Calculate aspect-ratio preserving dimensions capped at max dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2D canvas context'));
          return;
        }

        // Draw image smoothly
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG or PNG
        const isPng = file.type === 'image/png';
        const mimeType = isPng ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, isPng ? undefined : quality);

        // Desired display width on canvas (default around 260px)
        const displayWidth = Math.min(280, width);
        const displayHeight = Math.round(displayWidth * (height / width));

        resolve({
          src: dataUrl,
          width: displayWidth,
          height: displayHeight,
          name: file.name.replace(/\.[^/.]+$/, ''),
        });
      };
      img.onerror = () => reject(new Error('Failed to load image element'));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an existing base64/dataURL string into an optimized JPEG to save localStorage quota.
 */
export async function compressDataUrl(
  dataUrl: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.82
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image')) {
    return dataUrl;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.naturalWidth || img.width || 800;
      let height = img.naturalHeight || img.height || 800;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Generate stylish SVG sample product cards for new users
export function createSampleCard(
  id: string,
  title: string,
  category: string,
  x: number,
  y: number,
  colorScheme: { bg1: string; bg2: string; accent: string; icon: string }
) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
      <defs>
        <linearGradient id="grad_${id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${colorScheme.bg1}" />
          <stop offset="100%" stop-color="${colorScheme.bg2}" />
        </linearGradient>
        <filter id="shadow_${id}" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="20" stdDeviation="25" flood-opacity="0.15" />
        </filter>
      </defs>
      
      <!-- Studio Background -->
      <rect width="600" height="750" fill="url(#grad_${id})" rx="24"/>
      
      <!-- Podium / Platform -->
      <ellipse cx="300" cy="580" rx="190" ry="45" fill="${colorScheme.accent}" opacity="0.25" filter="url(#shadow_${id})"/>
      <ellipse cx="300" cy="570" rx="170" ry="35" fill="${colorScheme.accent}" opacity="0.45"/>
      <ellipse cx="300" cy="560" rx="150" ry="25" fill="#ffffff" opacity="0.8"/>

      <!-- Stylized Product Illustration -->
      ${getProductSvgBody(category, colorScheme.accent)}
      
      <!-- Studio Lighting Overlay / Glare -->
      <path d="M 0 0 L 250 0 L 100 750 L 0 750 Z" fill="#ffffff" opacity="0.06"/>

      <!-- Label / Watermark -->
      <rect x="36" y="36" width="130" height="32" rx="16" fill="#18181b" opacity="0.75"/>
      <text x="101" y="57" fill="#f4f4f5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600" text-anchor="middle" letter-spacing="1">${category.toUpperCase()}</text>
      
      <text x="300" y="680" fill="#27272a" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="700" text-anchor="middle">${title}</text>
      <text x="300" y="710" fill="#71717a" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="500" text-anchor="middle">Studio Lighting • 4K Reference</text>
    </svg>
  `;

  const src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  return {
    id,
    x,
    y,
    width: 260,
    height: 325,
    src,
    name: title,
    aspectRatio: 600 / 750,
  };
}

function getProductSvgBody(category: string, accent: string) {
  if (category === 'Perfume' || category === 'Cosmetic') {
    return `
      <!-- Luxury Bottle -->
      <g transform="translate(300, 360)">
        <rect x="-65" y="-120" width="130" height="230" rx="16" fill="#ffffff" opacity="0.95" stroke="${accent}" stroke-width="3"/>
        <rect x="-55" y="-105" width="110" height="200" rx="8" fill="${accent}" opacity="0.18"/>
        <!-- Liquid Level -->
        <path d="M -55 20 Q 0 10 55 20 L 55 90 Q 55 95 50 95 L -50 95 Q -55 95 -55 90 Z" fill="${accent}" opacity="0.5"/>
        <!-- Cap -->
        <rect x="-30" y="-175" width="60" height="55" rx="6" fill="#18181b"/>
        <rect x="-12" y="-188" width="24" height="15" rx="3" fill="#d4af37"/>
        <!-- Gold Label -->
        <rect x="-40" y="-30" width="80" height="48" rx="4" fill="#ffffff" stroke="#d4af37" stroke-width="1.5"/>
        <text x="0" y="-4" fill="#18181b" font-family="serif" font-size="15" font-weight="700" text-anchor="middle">ÉCLAT</text>
        <text x="0" y="10" fill="#a1a1aa" font-family="sans-serif" font-size="8" letter-spacing="2" text-anchor="middle">PARFUM</text>
      </g>
    `;
  }

  if (category === 'Footwear') {
    return `
      <!-- Sneaker Silhouette -->
      <g transform="translate(300, 390)">
        <path d="M -130 50 C -130 10 -90 -40 -30 -30 C 20 -20 70 -60 110 -20 C 130 0 140 40 130 70 C 110 80 -100 80 -130 50 Z" fill="#ffffff" stroke="${accent}" stroke-width="4"/>
        <path d="M -135 70 C -100 90 90 90 135 70 C 130 85 90 95 -100 95 C -130 95 -140 85 -135 70 Z" fill="${accent}"/>
        <!-- Swoosh / Stripe -->
        <path d="M -70 20 Q 0 50 80 -10 Q 30 30 -50 35 Z" fill="${accent}" opacity="0.8"/>
        <!-- Laces -->
        <line x1="10" y1="-15" x2="35" y2="-5" stroke="#18181b" stroke-width="3" stroke-linecap="round"/>
        <line x1="25" y1="-30" x2="50" y2="-20" stroke="#18181b" stroke-width="3" stroke-linecap="round"/>
        <line x1="40" y1="-45" x2="65" y2="-35" stroke="#18181b" stroke-width="3" stroke-linecap="round"/>
      </g>
    `;
  }

  // Smart Watch / Electronics
  return `
    <g transform="translate(300, 370)">
      <!-- Watch Strap -->
      <rect x="-35" y="-180" width="70" height="360" rx="20" fill="#27272a"/>
      <!-- Watch Case -->
      <rect x="-70" y="-80" width="140" height="160" rx="34" fill="#09090b" stroke="${accent}" stroke-width="4"/>
      <!-- Glass Screen -->
      <rect x="-60" y="-70" width="120" height="140" rx="26" fill="#18181b"/>
      <!-- UI Screen -->
      <circle cx="0" cy="-5" r="45" fill="none" stroke="${accent}" stroke-width="6" stroke-dasharray="190" stroke-dashoffset="50"/>
      <text x="0" y="3" fill="#ffffff" font-family="sans-serif" font-size="20" font-weight="700" text-anchor="middle">10:42</text>
      <text x="0" y="22" fill="${accent}" font-family="sans-serif" font-size="10" font-weight="600" text-anchor="middle">7,420 STEPS</text>
    </g>
  `;
}
