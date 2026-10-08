/**
 * Private Gemini proxy (Vercel serverless function).
 *
 * The browser never sees the API key: it sends { model, payload } with the
 * studio password in the `x-studio-password` header, and this function adds
 * GEMINI_API_KEY server-side.
 *
 * Required environment variables (Vercel → Project → Settings → Environment Variables):
 *   GEMINI_API_KEY   – Google AI Studio key
 *   STUDIO_PASSWORD  – password typed once in the app's settings
 */
import { timingSafeEqual } from 'node:crypto';

type Req = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const MODEL_PATTERN = /^gemini-[a-z0-9.\-]+$/i;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const studioPassword = process.env.STUDIO_PASSWORD;
  if (!apiKey || !studioPassword) {
    res.status(500).json({ error: { message: 'Server is not configured: set GEMINI_API_KEY and STUDIO_PASSWORD' } });
    return;
  }

  const headerValue = req.headers['x-studio-password'];
  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!provided || !safeEqual(provided, studioPassword)) {
    res.status(401).json({ error: { message: 'Unauthorized' } });
    return;
  }

  let body: any = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: { message: 'Invalid JSON' } });
      return;
    }
  }

  const model = body?.model;
  const payload = body?.payload;
  if (typeof model !== 'string' || !MODEL_PATTERN.test(model) || !payload || typeof payload !== 'object') {
    res.status(400).json({ error: { message: 'Expected { model, payload }' } });
    return;
  }

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
      }
    );
    const text = await upstream.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: { message: text.slice(0, 500) } };
    }
    res.status(upstream.status).json(json);
  } catch (err) {
    res.status(502).json({ error: { message: err instanceof Error ? err.message : 'Upstream request failed' } });
  }
}
