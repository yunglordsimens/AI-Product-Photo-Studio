/**
 * Cloud sync: the browser (IndexedDB) stays the working copy and works offline,
 * the cloud (/api/cloud → Neon + R2) keeps every device in step.
 *
 * Local key                 → cloud document
 *   aips_projects (array)   → project:<id>   (one per project, `_order` keeps the list order)
 *   aips_master_prompts     → prompts        ({ list })
 *   aips_products_<id>      → products:<id>  ({ list })
 *   aips_catalog_<id>       → catalog:<id>
 *
 * Photos inside documents are replaced by `ofst-img:<hash>` and stored once in R2.
 * Nothing is overwritten silently: every write says which cloud version it is based on;
 * if another device wrote in between, the studio asks what to keep.
 */
import { idbGet, idbSet, setIdbWriteListener, freezeIdbWrites } from './indexedDb';
import { getStudioPassword } from './gemini';
import { flushPendingProjectsWrite, mergeMasterPrompts } from './storage';
import type { MasterPrompt, Project } from '../types';

const ENABLED_KEY = 'aips_cloud_on';
const DEVICE_KEY = 'aips_device_id';
const META_KEY = 'aips_cloud_meta';
const REF = 'ofst-img:';
const PUSH_DELAY = 2500;
const POLL_EVERY = 45_000;

// ---------- state that the interface shows ----------

export type CloudPhase = 'off' | 'idle' | 'saving' | 'loading' | 'offline' | 'error';

export interface CloudConflict {
  docKey: string;
  label: string;
  /** what the other device wrote */
  cloud: CloudDoc | null;
}

export interface CloudState {
  enabled: boolean;
  phase: CloudPhase;
  message: string;
  progress: { done: number; total: number } | null;
  lastSyncAt: number | null;
  /** documents changed on another device that this one can load */
  remoteNewer: string[];
  conflicts: CloudConflict[];
}

interface CloudDoc {
  key: string;
  rev: number;
  device: string | null;
  deleted: boolean;
  updated_at: string;
  data?: any;
}

interface DocMeta {
  rev: number;
  sig: string;
}

interface Meta {
  docs: Record<string, DocMeta>;
  blobs: string[];
  /** project ids the cloud knows: a missing one means the project was deleted here */
  projects: string[];
}

let state: CloudState = {
  enabled: isCloudEnabled(),
  phase: isCloudEnabled() ? 'idle' : 'off',
  message: '',
  progress: null,
  lastSyncAt: null,
  remoteNewer: [],
  conflicts: [],
};
const listeners = new Set<() => void>();

function setState(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function getCloudState(): CloudState {
  return state;
}
export function subscribeCloud(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isCloudEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

function deviceName(): string {
  let id = '';
  try {
    id = localStorage.getItem(DEVICE_KEY) || '';
    if (!id) {
      id = Math.random().toString(36).slice(2, 8);
      localStorage.setItem(DEVICE_KEY, id);
    }
  } catch {
    /* ignore */
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const kind = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : 'браузер';
  return `${kind} · ${id}`;
}

// ---------- server calls ----------

class CloudError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function call(op: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<any> {
  const password = getStudioPassword();
  if (!password) throw new CloudError('Нужен пароль студии в настройках', 401);
  const qs = new URLSearchParams({ op, ...(init.query || {}) }).toString();
  let res: Response;
  try {
    res = await fetch(`/api/cloud?${qs}`, {
      ...init,
      headers: { 'x-studio-password': password, ...(init.headers || {}) },
    });
  } catch {
    throw new CloudError('Нет связи с облаком', 0);
  }
  if (op === 'img' && (init.method || 'GET') === 'GET' && res.ok) return res.blob();
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new CloudError(body?.error?.message || `Облако ответило ${res.status}`, res.status, body);
  return body;
}

const postJson = (op: string, payload: unknown) =>
  call(op, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

export async function checkCloud(): Promise<{ ok: boolean; message: string; docs?: number }> {
  try {
    const r = await call('status');
    return { ok: true, message: 'Облако на связи', docs: r.docs };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Облако недоступно' };
  }
}

// ---------- helpers ----------

async function sha(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** JSON with sorted keys, so the same content always gives the same signature */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableStringify(x))).join(',')}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined && typeof obj[k] !== 'function')
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

const signature = (refData: unknown) => sha(new TextEncoder().encode(stableStringify(refData)));

const isPhoto = (s: string) => s.length > 200 && s.startsWith('data:image/') && s.slice(0, 80).includes(';base64,');

function collectStrings(v: unknown, test: (s: string) => boolean, out: Set<string>) {
  if (typeof v === 'string') {
    if (test(v)) out.add(v);
  } else if (Array.isArray(v)) {
    for (const x of v) collectStrings(x, test, out);
  } else if (v && typeof v === 'object') {
    for (const x of Object.values(v)) collectStrings(x, test, out);
  }
}

function mapStrings(v: unknown, fn: (s: string) => string): any {
  if (typeof v === 'string') return fn(v);
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, fn));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = mapStrings(x, fn);
    return out;
  }
  return v;
}

function dataUrlBytes(url: string): { bytes: Uint8Array; type: string } {
  const comma = url.indexOf(',');
  let type = url.slice(5, url.indexOf(';')) || 'image/jpeg';
  if (type === 'image/jpg') type = 'image/jpeg';
  const bin = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type };
}

const hashOfUrl = new Map<string, string>();
const urlOfHash = new Map<string, string>();

async function hashPhoto(url: string): Promise<string> {
  const known = hashOfUrl.get(url);
  if (known) return known;
  const { bytes, type } = dataUrlBytes(url);
  const h = await sha(bytes);
  const ext = type.split('/')[1] || 'jpeg';
  const ref = `${h}.${ext}`;
  hashOfUrl.set(url, ref);
  urlOfHash.set(h, url);
  return ref;
}

/** Photos → `ofst-img:<hash>.<ext>`; returns the new data and the photos it needs */
async function toRefs(data: unknown): Promise<{ refData: any; photos: Map<string, string> }> {
  const urls = new Set<string>();
  collectStrings(data, isPhoto, urls);
  const photos = new Map<string, string>(); // hash → dataUrl
  for (const u of urls) {
    const ref = await hashPhoto(u);
    photos.set(ref.split('.')[0], u);
  }
  const refData = mapStrings(data, (s) => (isPhoto(s) ? REF + hashOfUrl.get(s) : s));
  return { refData, photos };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/** `ofst-img:` refs → photos (downloads only what this browser does not have) */
async function fromRefs(refData: unknown, onProgress?: (done: number, total: number) => void): Promise<any> {
  const refs = new Set<string>();
  collectStrings(refData, (s) => s.startsWith(REF), refs);
  const need = [...refs].map((r) => r.slice(REF.length).split('.')[0]).filter((h) => !urlOfHash.has(h));
  let done = 0;
  const unique = [...new Set(need)];
  await pool(unique, 6, async (h) => {
    try {
      const blob: Blob = await call('img', { query: { h } });
      const url = await blobToDataUrl(blob);
      urlOfHash.set(h, url);
      hashOfUrl.set(url, `${h}.${(blob.type || 'image/jpeg').split('/')[1]}`);
    } catch (e) {
      // One missing photo must not block the rest; offline stops everything
      if (e instanceof CloudError && e.status === 0) throw e;
    }
    onProgress?.(++done, unique.length);
  });
  return mapStrings(refData, (s) => {
    if (!s.startsWith(REF)) return s;
    return urlOfHash.get(s.slice(REF.length).split('.')[0]) || s;
  });
}

// ---------- local ⇄ cloud documents ----------

const isSyncedKey = (k: string) =>
  k === 'aips_projects' || k === 'aips_master_prompts' || /^aips_(products|catalog)_(?!library)/.test(k);

function localKeyOf(docKey: string): string {
  if (docKey === 'prompts') return 'aips_master_prompts';
  if (docKey.startsWith('project:')) return 'aips_projects';
  const [kind, id] = docKey.split(':');
  return `aips_${kind}_${id}`;
}

function docsOf(localKey: string, value: any): { docKey: string; data: any }[] {
  if (value == null) return [];
  if (localKey === 'aips_projects') {
    return (Array.isArray(value) ? value : []).map((p: Project, i: number) => ({
      docKey: `project:${p.id}`,
      data: { ...p, _order: i },
    }));
  }
  if (localKey === 'aips_master_prompts') return [{ docKey: 'prompts', data: { list: value } }];
  const m = localKey.match(/^aips_(products|catalog)_(.+)$/);
  if (!m) return [];
  return [{ docKey: `${m[1]}:${m[2]}`, data: m[1] === 'products' ? { list: value } : value }];
}

async function localDoc(docKey: string): Promise<any | undefined> {
  const value = await idbGet<any>(localKeyOf(docKey));
  return docsOf(localKeyOf(docKey), value).find((d) => d.docKey === docKey)?.data;
}

async function labelOf(docKey: string, data?: any): Promise<string> {
  const projects = (await idbGet<Project[]>('aips_projects')) || [];
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.name;
  if (docKey === 'prompts') return 'Мастер-промпты';
  const [kind, id] = docKey.split(':');
  const name = nameOf(id) || (kind === 'project' && data?.name) || 'проект';
  if (kind === 'project') return `Доска «${name}»`;
  if (kind === 'products') return `Позиции «${name}»`;
  return `Каталог «${name}»`;
}

async function loadMeta(): Promise<Meta> {
  const m = await idbGet<Meta>(META_KEY);
  return { docs: m?.docs || {}, blobs: m?.blobs || [], projects: m?.projects || [] };
}
let metaCache: Meta | null = null;
async function meta(): Promise<Meta> {
  if (!metaCache) metaCache = await loadMeta();
  return metaCache;
}
async function saveMeta() {
  if (metaCache) await idbSet(META_KEY, metaCache, { silent: true, force: true });
}

async function uploadPhotos(photos: Map<string, string>) {
  const m = await meta();
  const known = new Set(m.blobs);
  const missing = [...photos.keys()].filter((h) => !known.has(h));
  if (!missing.length) return;
  // Already in the cloud from another device?
  for (let i = 0; i < missing.length; i += 200) {
    const r = await postJson('has', { hashes: missing.slice(i, i + 200) });
    for (const h of r.found as string[]) known.add(h);
  }
  const upload = missing.filter((h) => !known.has(h));
  let done = 0;
  if (upload.length) setState({ progress: { done: 0, total: upload.length }, message: `Фото в облако: 0 из ${upload.length}` });
  await pool(upload, 4, async (h) => {
    const { bytes, type } = dataUrlBytes(photos.get(h)!);
    await call('img', {
      method: 'PUT',
      query: { h, t: type },
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes as BodyInit,
    });
    known.add(h);
    done++;
    setState({ progress: { done, total: upload.length }, message: `Фото в облако: ${done} из ${upload.length}` });
  });
  m.blobs = [...known];
  await saveMeta();
}

async function putDoc(docKey: string, refData: any, baseRev: number, deleted = false): Promise<{ rev: number } | { conflict: CloudDoc | null }> {
  try {
    const r = await postJson('put', { key: docKey, data: refData, baseRev, device: deviceName(), deleted });
    return { rev: r.rev };
  } catch (e) {
    if (e instanceof CloudError && e.status === 409) return { conflict: e.body?.current ?? null };
    throw e;
  }
}

async function addConflict(docKey: string, cloud: CloudDoc | null) {
  if (state.conflicts.some((c) => c.docKey === docKey)) return;
  const label = await labelOf(docKey, cloud?.data);
  setState({ conflicts: [...state.conflicts, { docKey, label, cloud }] });
}

/** Sends what changed in these local keys */
async function pushLocalKeys(localKeys: string[]) {
  const m = await meta();
  for (const localKey of localKeys) {
    const value = await idbGet<any>(localKey);
    const docs = docsOf(localKey, value);
    for (const { docKey, data } of docs) {
      if (state.conflicts.some((c) => c.docKey === docKey)) continue;
      const { refData, photos } = await toRefs(data);
      const sig = await signature(refData);
      const known = m.docs[docKey];
      if (known && known.sig === sig) continue;
      await uploadPhotos(photos);
      const r = await putDoc(docKey, refData, known?.rev || 0);
      if ('rev' in r) m.docs[docKey] = { rev: r.rev, sig };
      else await addConflict(docKey, r.conflict);
    }
    if (localKey === 'aips_projects' && Array.isArray(value)) {
      const ids = new Set((value as Project[]).map((p) => p.id));
      for (const id of m.projects.filter((x) => !ids.has(x))) {
        const docKey = `project:${id}`;
        const known = m.docs[docKey];
        if (!known || state.conflicts.some((c) => c.docKey === docKey)) continue;
        const r = await putDoc(docKey, {}, known.rev, true);
        if ('rev' in r) m.docs[docKey] = { rev: r.rev, sig: 'deleted' };
        else await addConflict(docKey, r.conflict);
      }
      m.projects = [...ids];
    }
    await saveMeta();
  }
}

/** Is the local copy of this document changed since it last matched the cloud? */
async function isLocallyChanged(docKey: string): Promise<boolean> {
  const m = await meta();
  const data = await localDoc(docKey);
  const known = m.docs[docKey];
  if (data === undefined) {
    // A project the cloud knew and this browser deleted, not sent yet
    return docKey.startsWith('project:') && !!known && known.sig !== 'deleted' && m.projects.includes(docKey.slice(8));
  }
  if (!known) return true;
  const { refData } = await toRefs(data);
  return (await signature(refData)) !== known.sig;
}

/** Writes cloud documents into this browser. Caller decides about reloading. */
async function applyCloudDocs(docs: CloudDoc[]) {
  const m = await meta();
  // Photos the browser already has do not need downloading: index the local copies first
  for (const d of docs) {
    const local = await localDoc(d.key);
    if (local !== undefined) await toRefs(local);
  }
  const resolved: { doc: CloudDoc; data: any }[] = [];
  for (const d of docs) {
    const data = d.deleted
      ? null
      : await fromRefs(d.data, (done, total) => setState({ message: `Фото из облака: ${done} из ${total}` }));
    resolved.push({ doc: d, data });
  }

  const projectDocs = resolved.filter((r) => r.doc.key.startsWith('project:'));
  if (projectDocs.length) {
    const local = ((await idbGet<Project[]>('aips_projects')) || []).slice();
    for (const { doc, data } of projectDocs.sort((a, b) => (a.data?._order ?? 0) - (b.data?._order ?? 0))) {
      const id = doc.key.slice(8);
      const at = local.findIndex((p) => p.id === id);
      if (doc.deleted || !data) {
        if (at >= 0) local.splice(at, 1);
        continue;
      }
      const { _order, ...project } = data;
      if (at >= 0) local[at] = project as Project;
      else local.splice(Math.min(_order ?? local.length, local.length), 0, project as Project);
    }
    await idbSet('aips_projects', local, { silent: true, force: true });
    m.projects = local.map((p) => p.id);
  }
  for (const { doc, data } of resolved) {
    if (doc.key.startsWith('project:')) continue;
    if (doc.deleted || !data) continue;
    const localKey = localKeyOf(doc.key);
    const value = doc.key === 'prompts' || doc.key.startsWith('products:') ? data.list || [] : data;
    await idbSet(localKey, value, { silent: true, force: true });
  }
  for (const { doc } of resolved) {
    m.docs[doc.key] = { rev: doc.rev, sig: doc.deleted ? 'deleted' : await signature(doc.data) };
  }
  await saveMeta();
}

async function fetchDocs(keys: string[]): Promise<CloudDoc[]> {
  const out: CloudDoc[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const r = await postJson('get', { keys: keys.slice(i, i + 100) });
    out.push(...r.docs);
  }
  return out;
}

async function listCloud(): Promise<CloudDoc[]> {
  return (await call('list')).docs as CloudDoc[];
}

/** Which cloud documents are newer than what this browser last saw */
async function newerInCloud(list: CloudDoc[]): Promise<CloudDoc[]> {
  const m = await meta();
  return list.filter((d) => !m.docs[d.key] || d.rev > m.docs[d.key].rev);
}

// ---------- the running sync ----------

let queue = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

const dirtyKeys = new Set<string>();
let pushTimer: number | null = null;

function schedulePush() {
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void pushNow();
  }, PUSH_DELAY);
}

export function pushNow(): Promise<void> {
  return serial(async () => {
    if (!state.enabled || !dirtyKeys.size) return;
    const keys = [...dirtyKeys];
    dirtyKeys.clear();
    setState({ phase: 'saving', message: 'Сохраняю в облако…' });
    try {
      await pushLocalKeys(keys);
      setState({ phase: 'idle', message: '', progress: null, lastSyncAt: Date.now() });
    } catch (e) {
      keys.forEach((k) => dirtyKeys.add(k));
      setState({
        phase: e instanceof CloudError && e.status === 0 ? 'offline' : 'error',
        message: e instanceof Error ? e.message : 'Не получилось сохранить в облако',
        progress: null,
      });
    }
  });
}

/** «Сохранить сейчас»: compares everything with the cloud and sends what differs */
export async function syncAllNow(): Promise<void> {
  if (!state.enabled) return;
  (await ALL_LOCAL_KEYS()).forEach((k) => dirtyKeys.add(k));
  await pushNow();
  await checkRemote();
}

/** Looks for changes made on other devices */
export function checkRemote(): Promise<void> {
  return serial(async () => {
    if (!state.enabled) return;
    try {
      const newer = await newerInCloud(await listCloud());
      const remote: string[] = [];
      for (const d of newer) {
        if (state.conflicts.some((c) => c.docKey === d.key)) continue;
        if (await isLocallyChanged(d.key)) {
          const [full] = await fetchDocs([d.key]);
          await addConflict(d.key, full || d);
        } else remote.push(d.key);
      }
      const recovered = state.phase === 'offline' || state.phase === 'error';
      setState({
        remoteNewer: remote,
        ...(recovered ? { phase: 'idle' as CloudPhase, message: '' } : {}),
        lastSyncAt: Date.now(),
      });
      if (dirtyKeys.size) schedulePush();
    } catch (e) {
      if (e instanceof CloudError && e.status === 0) setState({ phase: 'offline', message: e.message });
    }
  });
}

async function reloadWithFreshData(apply: () => Promise<void>) {
  flushPendingProjectsWrite();
  await new Promise((r) => setTimeout(r, 150));
  freezeIdbWrites();
  await apply();
  window.location.reload();
}

/** Loads what other devices changed, then restarts the studio with it */
export async function loadRemoteChanges(): Promise<void> {
  setState({ phase: 'loading', message: 'Загружаю из облака…' });
  try {
    const keys = state.remoteNewer;
    const docs = await fetchDocs(keys);
    await reloadWithFreshData(() => applyCloudDocs(docs));
  } catch (e) {
    setState({ phase: 'error', message: e instanceof Error ? e.message : 'Не получилось загрузить' });
  }
}

/** Conflict: keep this device's version (it becomes the newest in the cloud) */
export function keepMine(docKeys: string[]): Promise<void> {
  return serial(async () => {
    const m = await meta();
    setState({ phase: 'saving', message: 'Сохраняю твою версию…' });
    try {
      for (const docKey of docKeys) {
        const c = state.conflicts.find((x) => x.docKey === docKey);
        const data = await localDoc(docKey);
        const baseRev = c?.cloud?.rev ?? 0;
        let r;
        if (data === undefined) r = await putDoc(docKey, {}, baseRev, true);
        else {
          const { refData, photos } = await toRefs(data);
          await uploadPhotos(photos);
          r = await putDoc(docKey, refData, baseRev);
          if ('rev' in r) m.docs[docKey] = { rev: r.rev, sig: await signature(refData) };
        }
        if ('rev' in r) {
          if (data === undefined) m.docs[docKey] = { rev: r.rev, sig: 'deleted' };
          setState({ conflicts: state.conflicts.filter((x) => x.docKey !== docKey) });
        } else {
          // Changed again meanwhile: show the newest
          setState({ conflicts: state.conflicts.map((x) => (x.docKey === docKey ? { ...x, cloud: r.conflict } : x)) });
        }
      }
      await saveMeta();
      setState({ phase: 'idle', message: '', progress: null, lastSyncAt: Date.now() });
    } catch (e) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : 'Не получилось сохранить' });
    }
  });
}

/** Conflict: take the other device's version (the studio restarts with it) */
export async function takeCloud(docKeys: string[]): Promise<void> {
  setState({ phase: 'loading', message: 'Загружаю версию из облака…' });
  try {
    const docs = await fetchDocs(docKeys);
    await reloadWithFreshData(() => applyCloudDocs(docs));
  } catch (e) {
    setState({ phase: 'error', message: e instanceof Error ? e.message : 'Не получилось загрузить' });
  }
}

let started = false;
function startRunning() {
  if (started) return;
  started = true;
  setIdbWriteListener((key) => {
    if (!state.enabled || !isSyncedKey(key)) return;
    dirtyKeys.add(key);
    schedulePush();
  });
  window.setInterval(() => void checkRemote(), POLL_EVERY);
  window.addEventListener('focus', () => void checkRemote());
  window.addEventListener('online', () => void checkRemote());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void pushNow();
  });
}

const ALL_LOCAL_KEYS = async (): Promise<string[]> => {
  const projects = (await idbGet<Project[]>('aips_projects')) || [];
  return [
    'aips_projects',
    'aips_master_prompts',
    ...projects.flatMap((p) => [`aips_products_${p.id}`, `aips_catalog_${p.id}`]),
  ];
};

/**
 * Before the studio opens: bring in what other devices changed (only documents untouched here),
 * then send in the background whatever this browser changed while offline.
 */
export async function cloudStartup(onProgress: (text: string) => void, signal: { aborted: boolean }): Promise<void> {
  if (!state.enabled) return;
  startRunning();
  if (!getStudioPassword()) {
    setState({ phase: 'error', message: 'Нужен пароль студии в настройках' });
    return;
  }
  try {
    const list = await Promise.race([
      listCloud(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new CloudError('Облако долго не отвечает', 0)), 8000)),
    ]);
    if (signal.aborted) return;
    const newer = await newerInCloud(list);
    const safe: string[] = [];
    for (const d of newer) {
      if (await isLocallyChanged(d.key)) {
        const [full] = await fetchDocs([d.key]);
        await addConflict(d.key, full || d);
      } else safe.push(d.key);
    }
    if (safe.length && !signal.aborted) {
      onProgress('Загружаю изменения из облака…');
      const unsub = subscribeCloud(() => state.message && onProgress(state.message));
      const docs = await fetchDocs(safe);
      if (!signal.aborted) await applyCloudDocs(docs);
      unsub();
    }
    setState({ phase: 'idle', message: '', progress: null, lastSyncAt: Date.now() });
    (await ALL_LOCAL_KEYS()).forEach((k) => dirtyKeys.add(k));
    schedulePush();
  } catch (e) {
    setState({
      phase: e instanceof CloudError && e.status === 0 ? 'offline' : 'error',
      message: e instanceof Error ? e.message : 'Облако недоступно',
    });
  }
}

const isSampleOnly = (p: Project) =>
  (p.cards || []).every((c) => c.id.startsWith('card_sample_')) && !(p.notes || []).length;

/**
 * Connects this browser to the cloud for the first time.
 * Projects only here go up, projects only in the cloud come down, prompts are merged;
 * a project that differs on both sides becomes a question.
 */
export async function connectThisDevice(): Promise<{ pushed: number; pulled: number; conflicts: number }> {
  return serial(async () => {
    setState({ phase: 'loading', message: 'Проверяю облако…', progress: null });
    try {
      await call('status');
      const list = (await listCloud()).filter((d) => !d.deleted);
      const cloudKeys = new Set(list.map((d) => d.key));
      metaCache = { docs: {}, blobs: [], projects: [] };

      // An untouched starter project should not travel to the cloud
      let localProjects = (await idbGet<Project[]>('aips_projects')) || [];
      const cloudHasProjects = list.some((d) => d.key.startsWith('project:'));
      if (cloudHasProjects) {
        const keep: Project[] = [];
        for (const p of localProjects) {
          const products = (await idbGet<unknown[]>(`aips_products_${p.id}`)) || [];
          const catalog = await idbGet<{ items?: unknown[] }>(`aips_catalog_${p.id}`);
          if (isSampleOnly(p) && !products.length && !(catalog?.items || []).length && !cloudKeys.has(`project:${p.id}`)) continue;
          keep.push(p);
        }
        if (keep.length !== localProjects.length) {
          localProjects = keep;
          await idbSet('aips_projects', keep, { silent: true, force: true });
        }
      }

      // Prompts: merge both lists, nothing is lost
      const localPrompts = (await idbGet<MasterPrompt[]>('aips_master_prompts')) || [];
      if (cloudKeys.has('prompts')) {
        const [cloudPrompts] = await fetchDocs(['prompts']);
        const cloudList = (await fromRefs(cloudPrompts.data)).list || [];
        const merged = mergeMasterPrompts(cloudList, localPrompts).merged;
        await idbSet('aips_master_prompts', merged, { silent: true, force: true });
        metaCache.docs.prompts = { rev: cloudPrompts.rev, sig: '' };
      }

      // Documents on both sides: identical → just remember; different → ask
      const localKeys = await ALL_LOCAL_KEYS();
      const localDocKeys: string[] = [];
      for (const k of localKeys) {
        for (const d of docsOf(k, await idbGet<any>(k))) localDocKeys.push(d.docKey);
      }
      const both = localDocKeys.filter((k) => k !== 'prompts' && cloudKeys.has(k));
      const bothDocs = await fetchDocs(both);
      let conflicts = 0;
      for (const cd of bothDocs) {
        const data = await localDoc(cd.key);
        const { refData } = await toRefs(data);
        const sig = await signature(refData);
        const cloudSig = await signature(cd.data);
        if (sig === cloudSig) metaCache.docs[cd.key] = { rev: cd.rev, sig };
        else {
          metaCache.docs[cd.key] = { rev: cd.rev, sig: cloudSig };
          await addConflict(cd.key, cd);
          conflicts++;
        }
      }
      metaCache.projects = localProjects.map((p) => p.id).filter((id) => cloudKeys.has(`project:${id}`));
      await saveMeta();

      // Up: everything this browser has that the cloud has not (and the merged prompts)
      localStorage.setItem(ENABLED_KEY, '1');
      setState({ enabled: true, phase: 'saving', message: 'Переношу проекты в облако…' });
      startRunning();
      const onlyLocal = localDocKeys.filter((k) => !cloudKeys.has(k)).length;
      await pushLocalKeys(localKeys);

      // Down: what only the cloud has
      const onlyCloud = list.filter((d) => !localDocKeys.includes(d.key) && d.key !== 'prompts').map((d) => d.key);
      setState({ phase: 'idle', message: '', progress: null, lastSyncAt: Date.now(), remoteNewer: [] });
      if (onlyCloud.length) {
        const docs = await fetchDocs(onlyCloud);
        await reloadWithFreshData(() => applyCloudDocs(docs));
      }
      return { pushed: onlyLocal, pulled: onlyCloud.length, conflicts };
    } catch (e) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : 'Не получилось подключить облако', progress: null });
      throw e;
    }
  });
}

/** Stops syncing on this device; data stays both here and in the cloud */
export function disconnectThisDevice() {
  try {
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore */
  }
  setIdbWriteListener(null);
  started = false;
  setState({ enabled: false, phase: 'off', message: '', remoteNewer: [], conflicts: [], progress: null });
}
