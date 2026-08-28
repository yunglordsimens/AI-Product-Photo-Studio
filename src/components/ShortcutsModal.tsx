import React from 'react';
import { X, Keyboard, MousePointer, Move, ZoomIn, Trash2, Copy, Sparkles, StickyNote, Paperclip, Link2 } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    {
      icon: <Link2 className="w-4 h-4 text-blue-600" />,
      title: 'Связи между карточками (Miro)',
      desc: 'Включите режим связей, кликните первую карточку, затем вторую. Линии перерисовываются при перетаскивании.',
      keys: ['L', 'Д'],
    },
    {
      icon: <StickyNote className="w-4 h-4 text-amber-500" />,
      title: 'Стикеры и заметки',
      desc: 'Двойной клик на пустом месте канваса создаёт заметку. Перетащите на карточку для прикрепления.',
      keys: ['2x Клик'],
    },
    {
      icon: <Sparkles className="w-4 h-4 text-purple-600" />,
      title: 'AI Генерация по референсам',
      desc: 'Открыть / скрыть плавающую панель генерации. Тексты заметок учитываются автоматически!',
      keys: ['G', 'П'],
    },
    {
      icon: <Move className="w-4 h-4 text-blue-600" />,
      title: 'Панорамирование',
      desc: 'Зажмите Пробел и тяните ЛКМ, или зажмите колесо мыши (СКМ)',
      keys: ['Space + ЛКМ', 'СКМ'],
    },
    {
      icon: <ZoomIn className="w-4 h-4 text-indigo-600" />,
      title: 'Масштабирование (Зум)',
      desc: 'Вращение колеса мыши с зажатым Ctrl или кнопки + / - внизу справа',
      keys: ['Ctrl + Колесо', 'Пинч-зум'],
    },
    {
      icon: <MousePointer className="w-4 h-4 text-emerald-600" />,
      title: 'Выделение рамкой',
      desc: 'Нажмите на пустом месте и потяните, чтобы выделить несколько карточек и заметок',
      keys: ['Тянуть ЛКМ'],
    },
    {
      icon: <Keyboard className="w-4 h-4 text-amber-600" />,
      title: 'Мультивыделение',
      desc: 'Кликайте по элементам с зажатым Shift для добавления в выборку',
      keys: ['Shift + Клик'],
    },
    {
      icon: <Trash2 className="w-4 h-4 text-red-600" />,
      title: 'Удаление',
      desc: 'Удалить все выделенные карточки, линии связей и стикеры с канваса',
      keys: ['Delete', 'Backspace'],
    },
    {
      icon: <Copy className="w-4 h-4 text-purple-600" />,
      title: 'Групповое перемещение',
      desc: 'Перетащите карточку — привязанные к ней заметки и связи переместятся автоматически',
      keys: ['ЛКМ Drag'],
    },
  ];

  return (
    <div
      id="modal-shortcuts-backdrop"
      className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        id="modal-shortcuts-content"
        className="bg-white border border-gray-200 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Keyboard className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              Горячие клавиши и управление канвасом
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {shortcuts.map((s, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-100 rounded-lg text-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-white border border-gray-200 rounded-md shrink-0 shadow-xs">
                  {s.icon}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{s.title}</div>
                  <div className="text-gray-500 text-[11px]">{s.desc}</div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0 ml-2">
                {s.keys.map((k, kIdx) => (
                  <span
                    key={kIdx}
                    className="px-2 py-0.5 bg-white text-gray-700 rounded border border-gray-200 shadow-xs font-mono text-[10px]"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
};
