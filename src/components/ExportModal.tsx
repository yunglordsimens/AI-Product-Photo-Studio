import React, { useState } from 'react';
import { X, Download, Copy, Check, FileCode, FileJson, CheckCircle2 } from 'lucide-react';
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
    <div
      id="modal-export-backdrop"
      className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        id="modal-export-content"
        className="bg-white border border-gray-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 text-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <FileCode className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              Экспорт и автономная версия
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          Вы можете сохранить полноценный <b>index.html</b> со всеми встроенными стилями и скриптами для запуска на любом компьютере без интернета и без сервера.
        </p>

        <div className="space-y-3">
          {/* HTML download card */}
          <div className="p-3.5 bg-gray-50 border border-gray-200/80 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-amber-600" />
                <span>Автономный файл index.html</span>
              </div>
              <div className="text-[11px] text-gray-500">
                Чистый JS + CSS, работает локально в любом браузере
              </div>
            </div>

            <div className="flex gap-1.5">
              <button
                onClick={handleCopyHtml}
                className="px-2.5 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded text-xs font-medium flex items-center gap-1 transition-colors shadow-xs"
                title="Копировать код"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-600">Скопировано</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Копировать</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadHtml}
                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium flex items-center gap-1 shadow-sm transition-colors"
                title="Скачать index.html"
              >
                <Download className="w-3 h-3" />
                <span>Скачать</span>
              </button>
            </div>
          </div>

          {/* Project JSON card */}
          <div className="p-3.5 bg-gray-50 border border-gray-200/80 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                <FileJson className="w-3.5 h-3.5 text-blue-600" />
                <span>Резервная копия проекта (JSON)</span>
              </div>
              <div className="text-[11px] text-gray-500">
                Содержит текущие карточки и координаты
              </div>
            </div>

            <button
              onClick={handleDownloadJson}
              className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded text-xs font-medium flex items-center gap-1 shadow-xs transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>Сохранить</span>
            </button>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
