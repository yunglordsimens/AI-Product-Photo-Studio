import React, { useState, useSyncExternalStore } from 'react';
import { FloatingWindow } from './FloatingWindow';
import { Info } from './Info';
import {
  checkCloud,
  connectThisDevice,
  disconnectThisDevice,
  getCloudState,
  keepMine,
  loadRemoteChanges,
  syncAllNow,
  subscribeCloud,
  takeCloud,
  type CloudConflict,
} from '../utils/cloud';

export function useCloud() {
  return useSyncExternalStore(subscribeCloud, getCloudState, getCloudState);
}

const time = (t: number | string | null | undefined) =>
  t ? new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/** One line under the projects: where the data lives right now */
export function CloudStatusLine({ onOpen }: { onOpen: () => void }) {
  const s = useCloud();
  if (!s.enabled) {
    return (
      <button onClick={onOpen} className="underline text-left">
        Облако не подключено
      </button>
    );
  }
  const text =
    s.conflicts.length > 0
      ? `Нужно решить: ${s.conflicts.length}`
      : s.phase === 'saving' || s.phase === 'loading'
        ? s.message || 'Сохраняю…'
        : s.phase === 'offline'
          ? 'Нет связи, сохраню позже'
          : s.phase === 'error'
            ? s.message || 'Ошибка облака'
            : s.lastSyncAt
              ? `В облаке · ${new Date(s.lastSyncAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
              : 'В облаке';
  return (
    <button
      onClick={onOpen}
      className={`text-left ${s.conflicts.length || s.phase === 'error' ? 'bg-[var(--marker)] text-[var(--fg)] px-0.5' : ''}`}
      title="Облако: открыть настройки"
    >
      {text}
    </button>
  );
}

/** Yellow line on top: changes from another device, or versions to choose between */
export function CloudBanner({ onResolve }: { onResolve: () => void }) {
  const s = useCloud();
  if (!s.enabled) return null;
  if (s.conflicts.length) {
    return (
      <div className="bg-[var(--marker)] text-[var(--fg)] text-[12px] px-2 py-1 flex items-center justify-between z-40">
        <span>
          {s.conflicts.length === 1 ? `${s.conflicts[0].label} изменили` : `${s.conflicts.length} места изменили`} и здесь, и на другом
          устройстве. Ничего не потеряно, выбери, какую версию оставить.
        </span>
        <button onClick={onResolve} className="underline font-medium shrink-0 ml-2">
          Выбрать
        </button>
      </div>
    );
  }
  if (s.remoteNewer.length) {
    return (
      <div className="bg-[var(--marker)] text-[var(--fg)] text-[12px] px-2 py-1 flex items-center justify-between z-40">
        <span>Обновлено на другом устройстве. Твои изменения здесь уже в облаке.</span>
        <button
          onClick={() => void loadRemoteChanges()}
          disabled={s.phase === 'loading'}
          className="underline font-medium shrink-0 ml-2"
        >
          {s.phase === 'loading' ? s.message || 'Загружаю…' : 'Обновить'}
        </button>
      </div>
    );
  }
  return null;
}

function ConflictRow({ c }: { c: CloudConflict }) {
  const s = useCloud();
  const busy = s.phase === 'saving' || s.phase === 'loading';
  return (
    <li className="ofst-run py-1">
      <div className="text-[13px] text-[var(--fg)]">{c.label}</div>
      <div className="text-[12px] text-[var(--grey)]">
        {c.cloud?.deleted
          ? 'На другом устройстве удалено'
          : c.docKey.startsWith('project:') && c.cloud?.data?.name && !c.label.includes(`«${c.cloud.data.name}»`)
            ? `Там называется «${c.cloud.data.name}»`
            : 'Другая версия'}
        {c.cloud?.device ? ` · ${c.cloud.device}` : ''}
        {c.cloud?.updated_at ? ` · ${time(c.cloud.updated_at)}` : ''}
      </div>
      <div className="flex">
        <button disabled={busy} onClick={() => void keepMine([c.docKey])} className="ofst-cell">
          Оставить эту
        </button>
        <button disabled={busy} onClick={() => void takeCloud([c.docKey])} className="ofst-cell">
          {c.cloud?.deleted ? 'Удалить и здесь' : 'Взять с другого'}
        </button>
      </div>
    </li>
  );
}

/** What to keep when both devices changed the same thing */
export function CloudConflictsWindow({ onClose }: { onClose: () => void }) {
  const s = useCloud();
  const busy = s.phase === 'saving' || s.phase === 'loading';
  const keys = s.conflicts.map((c) => c.docKey);
  return (
    <FloatingWindow id="cloud-conflicts" title="Две версии" width={420} onClose={onClose} zIndex={72}>
      <p className="text-[12px] text-[var(--grey)] py-2">
        Это изменили и здесь, и на другом устройстве. «Оставить эту» отправит версию из этого браузера в облако. «Взять с
        другого» загрузит ту версию сюда, студия перезагрузится.
      </p>
      {s.conflicts.length === 0 ? (
        <p className="text-[13px] py-2">Всё решено.</p>
      ) : (
        <>
          <ul>{s.conflicts.map((c) => <ConflictRow key={c.docKey} c={c} />)}</ul>
          {s.conflicts.length > 1 && (
            <div className="flex justify-end pt-2">
              <button disabled={busy} onClick={() => void keepMine(keys)} className="ofst-cell ofst-cell--muted">
                Везде эту
              </button>
              <button disabled={busy} onClick={() => void takeCloud(keys)} className="ofst-cell ofst-cell--muted">
                Везде с другого
              </button>
            </div>
          )}
        </>
      )}
      {s.message && busy && <p className="text-[12px] text-[var(--grey)] pt-1">{s.message}</p>}
    </FloatingWindow>
  );
}

/** «Облако» inside the settings window */
export function CloudSettings({ onShowConflicts }: { onShowConflicts: () => void }) {
  const s = useCloud();
  const [check, setCheck] = useState<string>('');
  const [result, setResult] = useState<string>('');
  const busy = s.phase === 'saving' || s.phase === 'loading';

  const connect = async () => {
    setResult('');
    const probe = await checkCloud();
    if (!probe.ok) {
      setCheck(probe.message);
      return;
    }
    setCheck('');
    try {
      const r = await connectThisDevice();
      const parts = [
        r.pushed ? `отправлено: ${r.pushed}` : '',
        r.pulled ? `загружено: ${r.pulled}` : '',
        r.conflicts ? `нужно выбрать: ${r.conflicts}` : '',
      ].filter(Boolean);
      setResult(parts.length ? `Готово, ${parts.join(', ')}.` : 'Готово, всё уже совпадало.');
      if (r.conflicts) onShowConflicts();
    } catch {
      /* message is in the state */
    }
  };

  return (
    <div className="pt-4">
      <div className="ofst-run flex items-center gap-1">
        <span className="text-[13px] text-[var(--fg)]">Облако</span>
        <Info>
          Проекты, позиции, каталог и промпты хранятся в облаке студии (база Neon, фото в Cloudflare R2), поэтому на телефоне и на
          маке одно и то же. Браузер держит копию и работает без интернета; изменения уходят в облако сами через пару секунд.
          Если одно и то же поменяли на двух устройствах, студия спросит, что оставить.
        </Info>
      </div>
      {!s.enabled ? (
        <>
          <p className="text-[12px] text-[var(--grey)] pt-1">
            Сейчас всё лежит только в этом браузере. Подключение отправит проекты отсюда в облако и загрузит те, что уже там.
            Совпадающие проекты сравниваются, при разнице студия спросит.
          </p>
          <div className="flex justify-end pt-1">
            <button type="button" disabled={busy} onClick={() => void connect()} className="ofst-cell ofst-cell--primary">
              {busy ? s.message || 'Подключаю…' : 'Перенести в облако и подключить'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[12px] text-[var(--grey)] pt-1">
            {s.conflicts.length
              ? `Нужно выбрать версию: ${s.conflicts.length}.`
              : s.phase === 'offline'
                ? 'Нет связи. Всё сохранено в браузере и уйдёт в облако, когда связь вернётся.'
                : s.phase === 'error'
                  ? s.message
                  : busy
                    ? s.message || 'Сохраняю…'
                    : `Подключено. ${s.lastSyncAt ? `Последняя проверка ${time(s.lastSyncAt)}.` : ''}`}
          </p>
          <div className="flex justify-end pt-1">
            {s.conflicts.length > 0 && (
              <button type="button" onClick={onShowConflicts} className="ofst-cell">
                Выбрать версии
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void disconnectThisDevice()} className="ofst-cell ofst-cell--muted">
              Отключить здесь
            </button>
            <button type="button" disabled={busy} onClick={() => void syncAllNow()} className="ofst-cell">
              Сохранить сейчас
            </button>
          </div>
        </>
      )}
      {(check || result || (s.phase === 'error' && !s.enabled)) && (
        <p className="text-[12px] pt-1">{check || result || s.message}</p>
      )}
    </div>
  );
}
