/**
 * Request guards for the two Gemini-backed endpoints.
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
