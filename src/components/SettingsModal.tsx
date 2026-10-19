import React, { useState, useEffect } from 'react';
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_OPTIONS,
  getImageModel,
  getStoredApiKey,
  getStudioPassword,
  setImageModel,
  setStoredApiKey,
  setStudioPassword,
} from '../utils/gemini';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (key: string) => void;
}

export function SettingsModal({ isOpen, onClose, onSaved }: SettingsModalProps) {
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_IMAGE_MODEL);
  const [showSecrets, setShowSecrets] = useState(false);
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword(getStudioPassword());
      setApiKey(getStoredApiKey());
      setModel(getImageModel());
      setIsSavedNotice(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setStudioPassword(password);
    setStoredApiKey(apiKey);
    setImageModel(model.trim() === DEFAULT_IMAGE_MODEL ? '' : model);
    setIsSavedNotice(true);
    if (onSaved) onSaved(apiKey);
    setTimeout(() => {
      setIsSavedNotice(false);
      onClose();
    }, 600);
  };

  const inputClass = 'w-full h-8 px-2 text-[13px]';

  return (
    <div
      id="modal-settings-backdrop"
      className="fixed inset-0 bg-black/40 ofst-fade z-[70] flex items-center justify-center p-2 select-none"
      onClick={onClose}
    >
      <div className="bg-white max-w-md w-full p-2 text-[var(--fg)]" onClick={(e) => e.stopPropagation()}>
        <div className="ofst-run">
          <span>Доступ к генерации</span>
          <button onClick={onClose} className="hover:text-[var(--fg)] cursor-pointer" aria-label="Закрыть">
            закрыть
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3 pt-2">
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="settings-studio-password" className="text-[12px] text-[var(--grey)]">
                Пароль студии
              </label>
              <button type="button" onClick={() => setShowSecrets(!showSecrets)} className="text-[12px] underline">
                {showSecrets ? 'скрыть' : 'показать'}
              </button>
            </div>
            <input
              id="settings-studio-password"
              type={showSecrets ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="пароль из Vercel (STUDIO_PASSWORD)"
              autoFocus
              className={inputClass}
            />
            <p className="text-[12px] text-[var(--grey)] pt-0.5">Основной способ. Ключ Gemini лежит на сервере, в браузер не попадает.</p>
          </div>

          <div>
            <label htmlFor="settings-gemini-key-input" className="text-[12px] text-[var(--grey)]">
              Личный API-ключ, необязательно
            </label>
            <input
              id="settings-gemini-key-input"
              type={showSecrets ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy…"
              className={inputClass}
            />
            <p className="text-[12px] text-[var(--grey)] pt-0.5">
              Если заполнен, запросы идут прямо в Google из этого браузера. Хранится только здесь.
            </p>
          </div>

          <div>
            <label htmlFor="settings-image-model" className="text-[12px] text-[var(--grey)]">
              Модель для фото
            </label>
            <input
              id="settings-image-model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_IMAGE_MODEL}
              className={inputClass}
              list="settings-image-model-options"
            />
            <datalist id="settings-image-model-options">
              {IMAGE_MODEL_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.note}
                </option>
              ))}
            </datalist>
            <ul className="pt-0.5">
              {IMAGE_MODEL_OPTIONS.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setModel(o.id)}
                    className={`w-full text-left px-1 py-0.5 text-[12px] cursor-pointer ${
                      model === o.id ? 'bg-[var(--fg)] text-white' : 'hover:bg-[var(--soft)]'
                    }`}
                  >
                    {o.id} <span className={model === o.id ? 'opacity-70' : 'text-[var(--grey)]'}>— {o.note}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-[var(--grey)] pt-0.5">Когда выйдет модель лучше, впиши её название сюда.</p>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="ofst-cell ofst-cell--muted">
              Отмена
            </button>
            <button type="submit" id="btn-settings-save" className="ofst-cell ofst-cell--primary">
              {isSavedNotice ? 'Сохранено' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
