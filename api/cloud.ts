/**
 * Studio cloud (Vercel serverless function): documents in Neon Postgres, photos in Cloudflare R2.
 *
 * The browser never sees the database or R2 keys. Every call carries the studio password in
 * `x-studio-password`, like /api/gemini. Photos are stored once by content hash (img/<hash>).
 *
 * Environment variables (Vercel → Project → Settings → Environment Variables):
 *   DATABASE_URL (or POSTGRES_URL)  – added by the Neon integration
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   STUDIO_PASSWORD
 *
 * Operations (?op=…):
 *   GET  status            – are the database and R2 reachable
 *   GET  list              – [{ key, rev, device, updated_at, deleted }]
 *   POST get   {keys}      – full documents
 *   POST put   {key, data, baseRev, device, deleted?} – writes only if the cloud is still at baseRev, else 409 + current
 *   POST has   {hashes}    – which photos are already stored
 *   PUT  img&h=<hash>&t=<mime>  (raw bytes) – store a photo
 *   GET  img&h=<hash>      – read a photo
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { AwsClient } from 'aws4fetch';

type Req = {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  send: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const HASH = /^[a-f0-9]{32}$/;
const KEY = /^(project|products|catalog):[A-Za-z0-9_\-.]{1,120}$|^prompts$/;
const MIME = /^image\/[a-z0-9.+-]{2,40}$/;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function header(req: Req, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function param(req: Req, name: string): string {
  const fromQuery = req.query?.[name];
  if (typeof fromQuery === 'string') return fromQuery;
  if (Array.isArray(fromQuery)) return fromQuery[0] || '';
  try {
    return new URL(req.url || '', 'http://x').searchParams.get(name) || '';
  } catch {
    return '';
  }
}

function jsonBody(req: Req): any {
  const b = req.body;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString('utf8'));
    } catch {
      return null;
    }
  }
  return b ?? null;
}

async function rawBody(req: Req): Promise<Buffer> {
  const b = req.body;
  if (Buffer.isBuffer(b)) return b;
  if (b instanceof Uint8Array) return Buffer.from(b);
  if (typeof b === 'string') return Buffer.from(b, 'binary');
  // Body not parsed by the platform: read the stream
  const stream = req as unknown as AsyncIterable<Buffer>;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function config() {
  const env = process.env;
  const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL || '';
  const r2 = {
    account: env.R2_ACCOUNT_ID || '',
    keyId: env.R2_ACCESS_KEY_ID || '',
    secret: env.R2_SECRET_ACCESS_KEY || '',
    bucket: env.R2_BUCKET || '',
  };
  const missing = [
    !env.STUDIO_PASSWORD && 'STUDIO_PASSWORD',
    !databaseUrl && 'DATABASE_URL',
    !r2.account && 'R2_ACCOUNT_ID',
    !r2.keyId && 'R2_ACCESS_KEY_ID',
    !r2.secret && 'R2_SECRET_ACCESS_KEY',
    !r2.bucket && 'R2_BUCKET',
  ].filter(Boolean) as string[];
  return { databaseUrl, r2, password: env.STUDIO_PASSWORD || '', missing };
}

let schemaReady: Promise<unknown> | null = null;
function db(url: string) {
  const sql = neon(url);
  if (!schemaReady) {
    schemaReady = sql`
      create table if not exists studio_docs (
        key text primary key,
        data jsonb not null,
        rev integer not null default 1,
        device text,
        deleted boolean not null default false,
        updated_at timestamptz not null default now()
      )`.catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return { sql, ready: schemaReady };
}

function r2Client(r2: ReturnType<typeof config>['r2']) {
  const client = new AwsClient({ accessKeyId: r2.keyId, secretAccessKey: r2.secret, service: 's3', region: 'auto' });
  const base = `https://${r2.account}.r2.cloudflarestorage.com/${encodeURIComponent(r2.bucket)}`;
  return {
    url: (key: string) => `${base}/${key}`,
    fetch: (url: string, init?: RequestInit) => client.fetch(url, init),
  };
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  const cfg = config();
  if (cfg.missing.length) {
    res.status(503).json({
      error: {
        code: 'not_configured',
        message: `В Vercel не заполнено: ${cfg.missing.join(', ')}. Settings → Environment Variables, затем Redeploy.`,
      },
    });
    return;
  }
  const provided = header(req, 'x-studio-password');
  if (!provided || !safeEqual(provided, cfg.password)) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Неверный пароль студии' } });
    return;
  }

  const op = param(req, 'op');
  const method = (req.method || 'GET').toUpperCase();

  try {
    if (op === 'status' && method === 'GET') {
      const { sql, ready } = db(cfg.databaseUrl);
      await ready;
      const [row] = (await sql`select count(*)::int as docs from studio_docs where not deleted`) as { docs: number }[];
      const r2 = r2Client(cfg.r2);
      const probe = await r2.fetch(r2.url('img/_probe'), { method: 'HEAD' });
      // 404 = credentials work, the object simply does not exist
      if (probe.status !== 404 && !probe.ok) {
        res.status(502).json({ error: { code: 'r2', message: `R2 ответил ${probe.status}: проверь ключ, Account ID и имя бакета` } });
        return;
      }
      res.status(200).json({ ok: true, docs: row?.docs ?? 0 });
      return;
    }

    if (op === 'list' && method === 'GET') {
      const { sql, ready } = db(cfg.databaseUrl);
      await ready;
      const rows = await sql`select key, rev, device, deleted, updated_at from studio_docs order by key`;
      res.status(200).json({ docs: rows });
      return;
    }

    if (op === 'get' && method === 'POST') {
      const keys = jsonBody(req)?.keys;
      if (!Array.isArray(keys) || keys.length > 500 || !keys.every((k) => typeof k === 'string' && KEY.test(k))) {
        res.status(400).json({ error: { message: 'Expected { keys: string[] }' } });
        return;
      }
      const { sql, ready } = db(cfg.databaseUrl);
      await ready;
      const rows = await sql`select key, rev, device, deleted, updated_at, data from studio_docs where key = any(${keys})`;
      res.status(200).json({ docs: rows });
      return;
    }

    if (op === 'put' && method === 'POST') {
      const body = jsonBody(req);
      const key = body?.key;
      const baseRev = Number(body?.baseRev ?? 0);
      const deleted = Boolean(body?.deleted);
      const data = deleted ? {} : body?.data;
      const device = typeof body?.device === 'string' ? body.device.slice(0, 80) : null;
      if (typeof key !== 'string' || !KEY.test(key) || !Number.isInteger(baseRev) || baseRev < 0 || !data || typeof data !== 'object') {
        res.status(400).json({ error: { message: 'Expected { key, data, baseRev }' } });
        return;
      }
      const { sql, ready } = db(cfg.databaseUrl);
      await ready;
      const json = JSON.stringify(data);
      const written =
        baseRev === 0
          ? await sql`insert into studio_docs (key, data, rev, device, deleted)
              values (${key}, ${json}::jsonb, 1, ${device}, ${deleted})
              on conflict (key) do nothing
              returning rev, updated_at`
          : await sql`update studio_docs
              set data = ${json}::jsonb, rev = rev + 1, device = ${device}, deleted = ${deleted}, updated_at = now()
              where key = ${key} and rev = ${baseRev}
              returning rev, updated_at`;
      if (written.length) {
        res.status(200).json({ rev: written[0].rev, updated_at: written[0].updated_at });
        return;
      }
      // Someone else wrote first: hand back what the cloud has now
      const current = await sql`select key, rev, device, deleted, updated_at, data from studio_docs where key = ${key}`;
      res.status(409).json({ error: { code: 'conflict', message: 'Изменено на другом устройстве' }, current: current[0] || null });
      return;
    }

    if (op === 'has' && method === 'POST') {
      const hashes = jsonBody(req)?.hashes;
      if (!Array.isArray(hashes) || hashes.length > 200 || !hashes.every((h) => typeof h === 'string' && HASH.test(h))) {
        res.status(400).json({ error: { message: 'Expected { hashes: string[] } (max 200)' } });
        return;
      }
      const r2 = r2Client(cfg.r2);
      const found: string[] = [];
      for (let i = 0; i < hashes.length; i += 20) {
        const slice = hashes.slice(i, i + 20);
        const results = await Promise.all(slice.map((h) => r2.fetch(r2.url(`img/${h}`), { method: 'HEAD' })));
        results.forEach((r, j) => r.ok && found.push(slice[j]));
      }
      res.status(200).json({ found });
      return;
    }

    if (op === 'img' && method === 'PUT') {
      const hash = param(req, 'h');
      const type = param(req, 't') || 'image/jpeg';
      if (!HASH.test(hash) || !MIME.test(type)) {
        res.status(400).json({ error: { message: 'Bad hash or type' } });
        return;
      }
      const bytes = await rawBody(req);
      const actual = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
      if (!bytes.length || actual !== hash) {
        res.status(400).json({ error: { message: 'Photo arrived damaged, try again' } });
        return;
      }
      const r2 = r2Client(cfg.r2);
      const put = await r2.fetch(r2.url(`img/${hash}`), {
        method: 'PUT',
        body: bytes,
        headers: { 'Content-Type': type },
      });
      if (!put.ok) {
        res.status(502).json({ error: { message: `R2 ответил ${put.status}` } });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (op === 'img' && method === 'GET') {
      const hash = param(req, 'h');
      if (!HASH.test(hash)) {
        res.status(400).json({ error: { message: 'Bad hash' } });
        return;
      }
      const r2 = r2Client(cfg.r2);
      const got = await r2.fetch(r2.url(`img/${hash}`));
      if (!got.ok) {
        res.status(got.status === 404 ? 404 : 502).json({ error: { message: `Фото не найдено (${got.status})` } });
        return;
      }
      const bytes = Buffer.from(await got.arrayBuffer());
      res.setHeader('Content-Type', got.headers.get('content-type') || 'image/jpeg');
      // Same hash = same bytes forever
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      res.status(200).send(bytes);
      return;
    }

    res.status(404).json({ error: { message: `Unknown op ${op || '(none)'}` } });
  } catch (err) {
    res.status(502).json({ error: { message: err instanceof Error ? err.message : 'Cloud request failed' } });
  }
}
