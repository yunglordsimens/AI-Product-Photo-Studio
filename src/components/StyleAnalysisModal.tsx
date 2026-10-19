import React, { useState, useEffect } from 'react';

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
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2"
      onClick={onClose}
    >
      <div
        id="modal-style-analysis-dialog"
        className="bg-white max-w-lg w-full flex flex-col max-h-[92vh] p-2 gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ofst-run shrink-0">
          <span>Анализ стиля</span>
          <span>свет, фон, цвет, ракурс</span>
          <button onClick={onClose} className="hover:text-[var(--fg)] cursor-pointer">
            закрыть
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar space-y-2">
          {isLoading ? (
            <p className="py-10 text-[clamp(20px,2vw,26px)] font-medium leading-tight tracking-[-.01em]">Смотрю на свет, фон, цвет и ракурс…</p>
          ) : (
            <>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-[var(--grey)]">Параметры стиля и теги</span>
                  <button onClick={handleCopy} className="text-[12px] underline cursor-pointer">
                    {copied ? 'скопировано' : 'копировать'}
                  </button>
                </div>
                <textarea
                  value={editedTags}
                  onChange={(e) => setEditedTags(e.target.value)}
                  rows={6}
                  className="w-full text-[13px] p-2 resize-y leading-snug"
                  placeholder="#свет #фон #контраст…"
                />
              </div>
              {!editedTags.startsWith('Ошибка') && (
                <p className="text-[12px] text-[var(--grey)] leading-snug">
                  Копия уже лежит на доске заметкой рядом с этими фото. «В генератор» — теги встанут в промпт; «Сохранить
                  как мастер-промпт» — стиль останется в библиотеке для любых проектов.
                </p>
              )}
            </>
          )}
        </div>

        {!isLoading && (
          <div className="flex justify-end shrink-0">
            {onUseInGeneration && (
              <button
                onClick={() => {
                  onUseInGeneration(editedTags);
                  onClose();
                }}
                className="ofst-cell"
              >
                В генератор
              </button>
            )}
            <button onClick={handleSavePrompt} disabled={!editedTags.trim() || savedSuccess} className="ofst-cell ofst-cell--primary">
              {savedSuccess ? 'Сохранено' : 'Сохранить как мастер-промпт'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
