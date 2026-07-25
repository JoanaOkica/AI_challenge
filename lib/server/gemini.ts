/**
 * Server-only Google Gemini client helpers. NEVER import this from a client
 * component — it reads the API key from the environment. Only the API route
 * handlers under app/api/* import this module.
 *
 * Free-tier note: Google may use free-tier prompts to improve their products,
 * including human review. That is acceptable for the synthetic sample case this
 * app ships with; enable billing (or move back to a no-training provider)
 * before putting a real client chronology through it.
 */

import { GoogleGenAI } from '@google/genai';

/**
 * Overridable so a model rename never needs a code change — set GEMINI_MODEL
 * if this default is retired or unavailable on your tier.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export class MissingKeyError extends Error {
  constructor() {
    super('GOOGLE_API_KEY is not set on the server.');
    this.name = 'MissingKeyError';
  }
}

function apiKey(): string {
  // GEMINI_API_KEY is the name Google's own docs use; accept either.
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
}

let client: GoogleGenAI | null = null;

export function getClient(): GoogleGenAI {
  const key = apiKey();
  if (!key) throw new MissingKeyError();
  if (!client) client = new GoogleGenAI({ apiKey: key });
  return client;
}

/**
 * Setup failures (wrong key, retired model name, exhausted free-tier quota) are
 * the ones a user actually hits, and a generic "try again" wastes their time.
 * Translate those into an actionable message; anything else stays generic so
 * upstream internals are not echoed to the browser.
 *
 * @returns a safe message, or null when the cause is not a known setup problem.
 */
export function explainError(err: unknown): string | null {
  const m = err instanceof Error ? err.message : String(err ?? '');
  if (/API_KEY_INVALID|API key not valid|API key expired/i.test(m)) {
    return 'GOOGLE_API_KEY is set but Google rejected it. Check the key at aistudio.google.com/apikey.';
  }
  if (/PERMISSION_DENIED|permission/i.test(m)) {
    return 'Google denied this request. The key may lack access to the Generative Language API.';
  }
  if (/not found|NOT_FOUND|is not supported|unsupported/i.test(m)) {
    return `The model "${GEMINI_MODEL}" is unavailable for this key. Set GEMINI_MODEL to one your tier supports.`;
  }
  if (/RESOURCE_EXHAUSTED|quota|rate limit|429/i.test(m)) {
    return 'Google free-tier quota reached. Wait a minute and try again, or enable billing.';
  }
  return null;
}

/**
 * Pull the first well-formed JSON object out of a model response. Even in JSON
 * mode a model can wrap output in prose or a code fence, so tolerate both.
 */
export function extractJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in the model response.');
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

/**
 * One non-streaming generation.
 *
 * @param json when true, ask for `application/json` back — used by the
 *             classifier and caption steps, which are parsed rather than shown.
 */
export async function generate(params: {
  system: string;
  user: string;
  maxTokens?: number;
  json?: boolean;
}): Promise<string> {
  const ai = getClient();
  const res = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: params.user,
    config: {
      systemInstruction: params.system,
      maxOutputTokens: params.maxTokens ?? 4096,
      ...(params.json ? { responseMimeType: 'application/json' } : {}),
    },
  });
  return (res.text ?? '').trim();
}
