import React from 'react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    {
      title: 'Связи между карточками (Miro)',
      desc: 'Включите режим связей, кликните первую карточку, затем вторую. Линии перерисовываются при перетаскивании.',
      keys: ['L', 'Д'],
    },
    {
      title: 'Стикеры и заметки',
      desc: 'Двойной клик на пустом месте канваса создаёт заметку. Перетащите на карточку для прикрепления.',
      keys: ['2x Клик'],
    },
    {
      title: 'AI Генерация по референсам',
      desc: 'Открыть / скрыть плавающую панель генерации. Тексты заметок учитываются автоматически!',
      keys: ['G', 'П'],
    },
    {
      title: 'Панорамирование',
      desc: 'Зажмите Пробел и тяните ЛКМ, или зажмите колесо мыши (СКМ)',
      keys: ['Space + ЛКМ', 'СКМ'],
    },
    {
      title: 'Масштабирование (Зум)',
      desc: 'Вращение колеса мыши с зажатым Ctrl или кнопки + / - внизу справа',
      keys: ['Ctrl + Колесо', 'Пинч-зум'],
    },
    {
      title: 'Выделение рамкой',
      desc: 'Нажмите на пустом месте и потяните, чтобы выделить несколько карточек и заметок',
      keys: ['Тянуть ЛКМ'],
    },
    {
      title: 'Мультивыделение',
      desc: 'Кликайте по элементам с зажатым Shift для добавления в выборку',
      keys: ['Shift + Клик'],
    },
    {
      title: 'Удаление',
      desc: 'Удалить все выделенные карточки, линии связей и стикеры с канваса',
      keys: ['Delete', 'Backspace'],
    },
    {
      title: 'Групповое перемещение',
      desc: 'Перетащите карточку — привязанные к ней заметки и связи переместятся автоматически',
      keys: ['ЛКМ Drag'],
    },
  ];

  return (
    <div id="modal-shortcuts-backdrop" className="fixed inset-0 bg-black/40 ofst-fade z-50 flex items-center justify-center p-2" onClick={onClose}>
      <div id="modal-shortcuts-content" className="bg-white max-w-lg w-full p-2 text-[var(--fg)]" onClick={(e) => e.stopPropagation()}>
        <div className="ofst-run">
          <span>Клавиши и доска</span>
          <button onClick={onClose} className="hover:text-[var(--fg)] cursor-pointer">
            закрыть
          </button>
        </div>
        <ol className="pt-1">
          {shortcuts.map((s, idx) => (
            <li key={idx} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-1.5">
              <div>
                <div className="text-[13px] font-medium">{s.title}</div>
                <div className="text-[12px] text-[var(--grey)] leading-snug">{s.desc}</div>
              </div>
              <div className="text-[12px] whitespace-nowrap">{s.keys.join(' + ')}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};
