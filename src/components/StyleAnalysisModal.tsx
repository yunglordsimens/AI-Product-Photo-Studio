import React, { useState, useEffect } from 'react';
import { X, Sparkles, Copy, Check, BookmarkPlus, Loader2, Wand2 } from 'lucide-react';

interface StyleAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  tagsText: string;
  isLoading: boolean;
  onSaveAsMasterPrompt: (tagsText: string) => void;
  onUseInGeneration?: (tagsText: string) => void;
}

export const StyleAnalysisModal: React.FC<StyleAnalysisModalProps> = ({
  isOpen,
  onClose,
  tagsText,
  isLoading,
  onSaveAsMasterPrompt,
  onUseInGeneration,
}) => {
  const [editedTags, setEditedTags] = useState(tagsText);
  const [copied, setCopied] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setEditedTags(tagsText);
    setSavedSuccess(false);
  }, [tagsText, isOpen]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedTags);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = editedTags;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSavePrompt = () => {
    onSaveAsMasterPrompt(editedTags);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div
      id="modal-style-analysis-backdrop"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="modal-style-analysis-dialog"
        className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-linear-to-r from-blue-50/50 via-indigo-50/30 to-purple-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 leading-tight">
                Результат анализа стиля
              </h2>
              <p className="text-xs text-gray-500">Gemini 2.5 Flash выделил ключевые параметры</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              <div>
                <p className="text-sm font-medium text-gray-800">Анализ референсов...</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Модель распознаёт тип света, фон, цветовую палитру и ракурс
                </p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-gray-700">
                    Извлечённые параметры стиля и теги
                  </label>
                  <button
                    onClick={handleCopy}
                    className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-green-600" />
                        <span className="text-green-600">Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Копировать</span>
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  value={editedTags}
                  onChange={(e) => setEditedTags(e.target.value)}
                  rows={4}
                  className="w-full text-sm font-mono text-gray-800 bg-gray-50/80 border border-gray-200 rounded-xl p-3.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none shadow-inner leading-relaxed"
                  placeholder="#свет #фон #контраст..."
                />
              </div>

              {/* Tag preview chips */}
              {editedTags && (
                <div>
                  <span className="text-[11px] font-medium text-gray-400 block mb-1.5 uppercase tracking-wider">
                    Предпросмотр тегов
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                    {editedTags
                      .split(/[, \n]+/)
                      .filter((t) => t.trim().length > 0)
                      .map((tag, idx) => {
                        const cleanTag = tag.startsWith('#') ? tag : `#${tag}`;
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100/80 px-2.5 py-1 rounded-lg"
                          >
                            {cleanTag}
                          </span>
                        );
                      })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
          >
            Закрыть
          </button>

          {!isLoading && (
            <div className="flex items-center gap-2">
              {onUseInGeneration && (
                <button
                  onClick={() => {
                    onUseInGeneration(editedTags);
                    onClose();
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>В генератор</span>
                </button>
              )}

              <button
                onClick={handleSavePrompt}
                disabled={!editedTags.trim() || savedSuccess}
                className={`px-4 py-2 text-xs font-medium text-white rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
                  savedSuccess
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Сохранено!</span>
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>Сохранить как мастер-промпт</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
