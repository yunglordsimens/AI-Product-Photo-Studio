import React from 'react';

/** Video tab: a placeholder until the video tools are built. Lists what is planned, in the studio's own voice. */
export const VideoTab: React.FC<{ projectName: string }> = ({ projectName }) => (
  <div className="absolute inset-0 z-30 bg-white overflow-y-auto p-2">
    <div className="ofst-run">
      <span>Видео · {projectName}</span>
      <span>скоро</span>
    </div>
    <p className="mt-3 max-w-[18ch] text-[clamp(30px,3.6vw,56px)] font-medium leading-none tracking-[-.025em]">
      Видео из готовых фото
    </p>
    <ol className="mt-6 max-w-[64ch] text-[13px]">
      {[
        ['360°', 'съёмка на поворотном столе → кадры по кругу → чистка одним стилем → вращение на сайте'],
        ['Скролл-сцена', 'последовательность кадров, которая проигрывается при прокрутке страницы'],
        ['Короткие ролики', 'позиция каталога оживает: пар, капля, свет, лёгкое движение камеры'],
        ['Рилс из каталога', 'лучшие ★ кадры собираются в вертикальный ролик под музыку'],
      ].map(([title, text], i) => (
        <li key={title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 py-1.5">
          <span className="tabular-nums text-[var(--grey)]">{String(i + 1).padStart(2, '0')}</span>
          <span>
            <span className="font-medium">{title}</span> <span className="text-[var(--grey)]">— {text}</span>
          </span>
        </li>
      ))}
    </ol>
  </div>
);
