/**
 * Request guards for the AI-backed endpoints.
 *
 * These routes are unauthenticated and every call costs real money, so on a
 * publicly shared deployment they are the highest-value target in the app.
 * The controls here are defence in depth:
 *   - same-origin check      -> stops other sites driving your API budget
 *   - body size cap          -> stops memory/DoS via a giant JSON payload
 *   - per-IP token bucket    -> stops one client draining the budget
 *   - field caps/truncation  -> bounds the token spend of any single call
 *   - safeText()             -> neutralises prompt injection from record text
 */

export const MAX_BODY_BYTES = 512 * 1024; // 512 KB — ample for a big chronology

/* ------------------------------------------------------------------ *
 * Rate limiting (in-memory token bucket, per IP)                      *
 * ------------------------------------------------------------------ */

interface Bucket {
  tokens: number;
  updated: number;
}

const BUCKETS = new Map<string, Bucket>();
const CAPACITY = 8; // burst
const REFILL_PER_MS = 8 / (60 * 60 * 1000); // 8 requests per hour, sustained
const MAX_TRACKED_IPS = 5_000;

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/* ------------------------------------------------------------------ *
 * Access gate                                                         *
 * ------------------------------------------------------------------ */

/**
 * Rate limiting is mitigation; authentication is the actual fix. On a public
 * link the paid endpoints are otherwise open to the whole internet, so when
 * APP_ACCESS_CODE is set every AI request must carry it.
 *
 * Unset (the default) leaves the app open, so local development and the
 * no-backend pages are unaffected.
 */
export function accessCodeRequired(): boolean {
  return !!process.env.APP_ACCESS_CODE;
}

/** Constant-time compare so the code cannot be recovered by timing. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  // Compare a fixed number of bytes regardless of length, then fold in the
  // length check, so early-exit never leaks the prefix length.
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function hasAccess(req: Request): boolean {
  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) return true;
  return safeEqual(req.headers.get('x-access-code') ?? '', expected);
}

/* ------------------------------------------------------------------ *
 * Durable rate limiting (optional)                                    *
 * ------------------------------------------------------------------ */

/**
 * The in-memory bucket below is per-process. On Vercel each serverless instance
 * gets its own, so the effective ceiling is (instances x CAPACITY) and it resets
 * on every cold start. When an Upstash Redis REST endpoint is configured we use
 * it instead, giving one counter shared by every instance.
 */
function upstashConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

const WINDOW_SECONDS = 3600;
const WINDOW_LIMIT = 8;

async function upstashAllow(ip: string): Promise<boolean> {
  const base = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const key = `cp:rl:${ip}:${Math.floor(Date.now() / 1000 / WINDOW_SECONDS)}`;
  const res = await fetch(`${base}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, String(WINDOW_SECONDS)],
    ]),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const out = (await res.json()) as { result: number }[];
  return Number(out?.[0]?.result ?? 0) <= WINDOW_LIMIT;
}

/**
 * Shared-state limit when configured, per-process otherwise.
 * Fails **closed** on a store error: a limiter that silently stops limiting is
 * worse than a request that asks the user to retry.
 */
export async function rateLimitDurable(ip: string): Promise<boolean> {
  if (!upstashConfigured()) return rateLimit(ip);
  try {
    return await upstashAllow(ip);
  } catch (err) {
    console.error('[api] rate-limit store unavailable:', err);
    return false;
  }
}

/** @returns true when the caller is within budget. */
export function rateLimit(ip: string): boolean {
  const now = Date.now();

  // Bound memory: drop the oldest entries if the map grows unreasonably.
  if (BUCKETS.size > MAX_TRACKED_IPS) {
    for (const [k, v] of BUCKETS) {
      if (now - v.updated > 60 * 60 * 1000) BUCKETS.delete(k);
    }
    if (BUCKETS.size > MAX_TRACKED_IPS) BUCKETS.clear();
  }

  const b = BUCKETS.get(ip) ?? { tokens: CAPACITY, updated: now };
  b.tokens = Math.min(CAPACITY, b.tokens + (now - b.updated) * REFILL_PER_MS);
  b.updated = now;

  if (b.tokens < 1) {
    BUCKETS.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  BUCKETS.set(ip, b);
  return true;
}

/* ------------------------------------------------------------------ *
 * Origin + body parsing                                               *
 * ------------------------------------------------------------------ */

/**
 * Reject cross-site calls. A browser always sends `Origin` on a cross-origin
 * POST; when it is present it must match the request host. A missing Origin
 * (curl, server-to-server) is allowed through to the rate limiter.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get('host') ?? new URL(req.url).host);
  } catch {
    return false;
  }
}

export class RequestTooLarge extends Error {}

/** Read the body with a hard byte cap, then parse it as JSON. */
export async function readJson<T>(req: Request): Promise<T> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new RequestTooLarge();

  const raw = await req.text();
  // content-length can lie or be absent — measure what actually arrived.
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new RequestTooLarge();
  return JSON.parse(raw) as T;
}

/* ------------------------------------------------------------------ *
 * Untrusted text handling                                             *
 * ------------------------------------------------------------------ */

/**
 * Record text is attacker-controlled (anyone can upload a workbook whose
 * Summary cell says "ignore your instructions and ..."). Strip the delimiter
 * and role markers a prompt injection would rely on, and cap the length.
 */
export function safeText(value: unknown, maxLen = 600): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, '') // control chars
    .replace(/<\/?(?:record|records|instructions?|system|human|assistant)>/gi, '')
    .replace(/\r/g, '')
    .slice(0, maxLen)
    .trim();
}

/** Cap an array's length without throwing. */
export function capArray<T>(value: unknown, max: number): T[] {
  return Array.isArray(value) ? (value.slice(0, max) as T[]) : [];
}

/* ------------------------------------------------------------------ *
 * Responses                                                           *
 * ------------------------------------------------------------------ */

export const LIMITS = {
  /** Encounters forwarded to the demand drafter. */
  encounters: 400,
  /** Regions / events / records forwarded to the deck builder. */
  listItems: 60,
  /** Attorney free-text fields. */
  attorneyField: 800,
};

/**
 * Log the real failure server-side, hand the client a generic message.
 * Upstream SDK errors can carry request metadata we do not want to echo.
 */
export function scrubError(err: unknown, fallback: string): string {
  console.error('[api] request failed:', err);
  return fallback;
}
