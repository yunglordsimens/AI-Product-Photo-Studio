import React, { useState } from 'react';
import { BookOpen, Plus, Edit2, Trash2, X, Check, Tag, Sparkles, Copy, Search } from 'lucide-react';
import { MasterPrompt } from '../types';

interface MasterPromptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterPrompts: MasterPrompt[];
  onSaveMasterPrompts: (prompts: MasterPrompt[]) => void;
  onSelectPromptForGen?: (promptText: string) => void;
}

export const MasterPromptsModal: React.FC<MasterPromptsModalProps> = ({
  isOpen,
  onClose,
  masterPrompts,
  onSaveMasterPrompts,
  onSelectPromptForGen,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPrompt, setEditingPrompt] = useState<MasterPrompt | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formText, setFormText] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formError, setFormError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartCreate = () => {
    setEditingPrompt(null);
    setFormName('');
    setFormText('');
    setFormTags('');
    setFormError('');
    setIsCreatingNew(true);
  };

  const handleStartEdit = (p: MasterPrompt) => {
    setEditingPrompt(p);
    setFormName(p.name);
    setFormText(p.prompt);
    setFormTags((p.tags || []).join(', '));
    setFormError('');
    setIsCreatingNew(false);
  };

  const handleCancelForm = () => {
    setEditingPrompt(null);
    setIsCreatingNew(false);
    setFormError('');
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Укажите название мастер-промпта');
      return;
    }
    if (!formText.trim()) {
      setFormError('Укажите текст промпта');
      return;
    }

    const parsedTags = formTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingPrompt) {
      const updated = masterPrompts.map((p) =>
        p.id === editingPrompt.id
          ? {
              ...p,
              name: formName.trim(),
              prompt: formText.trim(),
              tags: parsedTags,
            }
          : p
      );
      onSaveMasterPrompts(updated);
    } else {
      const newPrompt: MasterPrompt = {
        id: 'mp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: formName.trim(),
        prompt: formText.trim(),
        tags: parsedTags,
        createdAt: Date.now(),
      };
      onSaveMasterPrompts([newPrompt, ...masterPrompts]);
    }

    handleCancelForm();
  };

  const handleDelete = (prompt: MasterPrompt) => {
    if (window.confirm(`Удалить мастер-промпт "${prompt.name}"?`)) {
      const filtered = masterPrompts.filter((p) => p.id !== prompt.id);
      onSaveMasterPrompts(filtered);
      if (editingPrompt?.id === prompt.id) {
        handleCancelForm();
      }
    }
  };

  const handleCopyText = (prompt: MasterPrompt) => {
    navigator.clipboard.writeText(prompt.prompt);
    setCopiedId(prompt.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const filteredPrompts = masterPrompts.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.prompt.toLowerCase().includes(q) ||
      (p.tags && p.tags.some((t) => t.toLowerCase().includes(q)))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-purple-50/50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                Мастер-промпты
              </h2>
              <p className="text-xs text-gray-500">
                Библиотека готовых шаблонов и стилей для быстрой генерации
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Top Actions: Search + Add Button */}
          {!isCreatingNew && !editingPrompt && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по названию, тексту или тегам..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-purple-500 focus:outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                onClick={handleStartCreate}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить новый</span>
              </button>
            </div>
          )}

          {/* Create / Edit Form */}
          {(isCreatingNew || editingPrompt) && (
            <form
              onSubmit={handleSaveForm}
              className="p-4 bg-purple-50/50 border border-purple-200 rounded-2xl space-y-3 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between pb-2 border-b border-purple-100">
                <span className="text-xs font-bold text-purple-900">
                  {editingPrompt ? 'Редактировать мастер-промпт' : 'Новый мастер-промпт'}
                </span>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  Отмена
                </button>
              </div>

              {formError && (
                <div className="p-2 bg-red-100 border border-red-200 text-red-700 rounded-lg text-xs">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Название <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Например: Каталожный тёмный фон"
                  className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Текст промпта <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder="Опишите фон, окружение, свет, детализацию..."
                  className="w-full p-2.5 text-xs bg-white border border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Теги (через запятую, опционально)
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="каталог, темный фон, студия"
                  className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200/60 rounded-lg"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-xs flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Сохранить</span>
                </button>
              </div>
            </form>
          )}

          {/* List of Prompts */}
          <div className="space-y-2.5">
            {filteredPrompts.length === 0 ? (
              <div className="py-8 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40 text-gray-500" />
                <p className="text-xs font-medium text-gray-600">
                  {searchQuery ? 'Ничего не найдено по запросу' : 'Список мастер-промптов пуст'}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Нажмите кнопку «Добавить новый», чтобы сохранить шаблон
                </p>
              </div>
            ) : (
              filteredPrompts.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 bg-white hover:bg-gray-50/80 border border-gray-200 rounded-2xl shadow-2xs transition-all space-y-2 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-gray-900 group-hover:text-purple-700 transition-colors">
                        {item.name}
                      </h4>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed line-clamp-2 select-text font-normal">
                        {item.prompt}
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      {onSelectPromptForGen && (
                        <button
                          onClick={() => {
                            onSelectPromptForGen(item.prompt);
                            onClose();
                          }}
                          className="px-2.5 py-1 bg-purple-100 hover:bg-purple-600 text-purple-700 hover:text-white rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 shadow-2xs"
                          title="Вставить в форму генерации"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Применить</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleCopyText(item)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Скопировать текст"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleStartEdit(item)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Редактировать"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-gray-100 text-[10px]">
                      <Tag className="w-3 h-3 text-gray-400 mr-0.5" />
                      {item.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <span>
            Всего шаблонов: <b>{masterPrompts.length}</b>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-gray-100 text-gray-700 font-medium rounded-xl border border-gray-300 shadow-2xs transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
