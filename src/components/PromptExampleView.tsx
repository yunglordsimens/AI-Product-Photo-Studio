import React, { useState } from 'react';
import { PromptExample } from '../types';

/**
 * «до | после» of a master prompt. Small: two squares side by side. Large: the result, and the source while hovered.
 */
export function PromptExampleView({ example, size = 'small', className = '' }: { example?: PromptExample; size?: 'small' | 'large'; className?: string }) {
  const [showBefore, setShowBefore] = useState(false);
  if (!example) {
    return size === 'small' ? (
      <div className={`w-[84px] h-[42px] bg-[var(--soft)] flex items-center justify-center text-[10px] text-[var(--grey)] ${className}`}>нет примера</div>
    ) : (
      <div className={`h-24 bg-[var(--soft)] flex items-center justify-center text-[12px] text-[var(--grey)] p-2 text-center ${className}`}>
        нет примера: появится после первой генерации с этим промптом
      </div>
    );
  }
  if (size === 'small') {
    return (
      <div className={`flex w-[84px] h-[42px] shrink-0 ${className}`} title="до | после">
        <div className="w-[42px] h-[42px] bg-[var(--soft)]">
          {example.before && <img src={example.before} alt="до" className="w-full h-full object-cover" />}
        </div>
        <div className="w-[42px] h-[42px] bg-[var(--soft)]">
          <img src={example.after} alt="после" className="w-full h-full object-cover" />
        </div>
      </div>
    );
  }
  const src = showBefore && example.before ? example.before : example.after;
  return (
    <div
      className={`relative aspect-[4/5] bg-[var(--soft)] overflow-hidden ${className}`}
      onMouseEnter={() => setShowBefore(true)}
      onMouseLeave={() => setShowBefore(false)}
      onClick={() => setShowBefore((v) => !v)}
    >
      <img src={src} alt={showBefore ? 'до' : 'после'} className="absolute inset-0 w-full h-full object-cover" />
      <span className={`absolute left-0 top-0 px-1 text-[11px] ${showBefore ? 'bg-white' : 'bg-[var(--fg)] text-white'}`}>
        {showBefore && example.before ? 'до' : 'после'}
      </span>
      {example.before && !showBefore && <span className="absolute right-0 top-0 px-1 text-[11px] bg-white/85 text-[var(--grey)]">наведи — «до»</span>}
    </div>
  );
}
