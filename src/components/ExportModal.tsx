import React, { useState } from 'react';
import { generateStandaloneHtml } from '../utils/standaloneHtml';
import { Project } from '../types';
import { exportProjectToJson } from '../utils/storage';

interface ExportModalProps {
  isOpen: boolean;
  project: Project;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  project,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleDownloadHtml = () => {
    const htmlCode = generateStandaloneHtml();
    const blob = new Blob([htmlCode], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCopyHtml = async () => {
    const htmlCode = generateStandaloneHtml();
    try {
      await navigator.clipboard.writeText(htmlCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = htmlCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadJson = () => {
    exportProjectToJson(project);
  };

  return (
    <div id="modal-export-backdrop" className="fixed inset-0 bg-black/40 ofst-fade z-50 flex items-center justify-center p-2" onClick={onClose}>
      <div id="modal-export-content" className="bg-white max-w-md w-full p-2 text-[var(--fg)]" onClick={(e) => e.stopPropagation()}>
        <div className="ofst-run">
          <span>Экспорт</span>
          <button onClick={onClose} className="hover:text-[var(--fg)] cursor-pointer">
            закрыть
          </button>
        </div>
        <ol className="pt-1">
          <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1.5">
            <div>
              <div className="text-[13px] font-medium">Копия проекта, JSON</div>
              <div className="text-[12px] text-[var(--grey)]">Карточки, заметки, мастер-промпты. Открывается через «Открыть».</div>
            </div>
            <button onClick={handleDownloadJson} className="ofst-cell ofst-cell--primary">
              Сохранить
            </button>
          </li>
          <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1.5">
            <div>
              <div className="text-[13px] font-medium">Студия одним файлом, index.html</div>
              <div className="text-[12px] text-[var(--grey)]">Работает в браузере без сервера.</div>
            </div>
            <div className="flex">
              <button onClick={handleCopyHtml} className="ofst-cell ofst-cell--muted" title="Копировать код">
                {copied ? 'скопировано' : 'копия'}
              </button>
              <button onClick={handleDownloadHtml} className="ofst-cell" title="Скачать index.html">
                Скачать
              </button>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
};
