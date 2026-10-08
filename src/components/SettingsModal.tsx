import React, { useState, useEffect } from 'react';
import { Settings, X, Key, Check, Eye, EyeOff, Lock, Cpu } from 'lucide-react';
import {
  DEFAULT_IMAGE_MODEL,
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

  const inputClass =
    'w-full pl-9 pr-10 py-2 text-xs font-mono bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white transition-colors';

  return (
    <div
      id="modal-settings-backdrop"
      className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[70] flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 text-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Доступ к генерации</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="settings-studio-password" className="block text-xs font-semibold text-gray-700">
              Пароль студии
            </label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                id="settings-studio-password"
                type={showSecrets ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="пароль из Vercel (STUDIO_PASSWORD)"
                autoFocus
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowSecrets(!showSecrets)}
                className="absolute right-2.5 p-1 text-gray-400 hover:text-gray-600 rounded"
                title={showSecrets ? 'Скрыть' : 'Показать'}
              >
                {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Основной способ. Ключ Gemini лежит на сервере, в браузер не попадает.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="settings-gemini-key-input" className="block text-xs font-semibold text-gray-700">
              Личный API-ключ <span className="font-normal text-gray-400">(необязательно)</span>
            </label>
            <div className="relative flex items-center">
              <Key className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                id="settings-gemini-key-input"
                type={showSecrets ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy…"
                className={inputClass}
              />
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Если заполнен, запросы идут напрямую в Google с этого браузера (удобно при локальном запуске). Хранится
              только здесь, в localStorage.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="settings-image-model" className="block text-xs font-semibold text-gray-700">
              Модель для фото
            </label>
            <div className="relative flex items-center">
              <Cpu className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                id="settings-image-model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={DEFAULT_IMAGE_MODEL}
                className={inputClass}
              />
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              По умолчанию <span className="font-mono">{DEFAULT_IMAGE_MODEL}</span>. Когда выйдет модель лучше, поменяй
              здесь одной строкой.
            </p>
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              id="btn-settings-save"
              className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {isSavedNotice ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Сохранено</span>
                </>
              ) : (
                <span>Сохранить</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
