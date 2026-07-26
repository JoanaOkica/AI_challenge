/**
 * Server-only Workers AI client. NEVER import this from a client component —
 * it reaches for the Worker's runtime bindings, which do not exist in a browser.
 * Only the route handlers under app/api/* import this module.
 *
 * Why the binding and not an HTTP API: inference runs on the same Cloudflare
 * edge that already serves this app, so there is no API key to store, rotate, or
 * leak. The Worker is authorised by virtue of being the Worker. That removes the
 * single largest operational risk this project had.
 *
 * Privacy note: Cloudflare states it does not train on Workers AI inputs. That
 * is a materially better posture than a free consumer tier for anything
 * approaching a real client chronology, but it is still a third party
 * processing medical text — confirm it against your firm's engagement terms
 * before a live matter goes through it.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Overridable so a model rename never needs a code change — set AI_MODEL to any
 * text-generation model in the Workers AI catalogue.
 *
 * Llama 4 Scout is the default because these prompts are long: a full
 * chronology can run to hundreds of encounter blocks, and the smaller
 * instruct models on the platform truncate it. It also honours
 * `response_format`, which the classifier and caption steps depend on.
 */
export const AI_MODEL = process.env.AI_MODEL || '@cf/meta/llama-4-scout-17b-16e-instruct';

/** Raised when the Worker has no AI binding — a deployment/config problem. */
export class ProviderUnavailableError extends Error {
  constructor() {
    super('The Workers AI binding is not available in this runtime.');
    this.name = 'ProviderUnavailableError';
  }
}

type AiRunOutput = { response?: unknown; result?: { response?: unknown } };

/**
 * Structural type for the binding rather than `@cloudflare/workers-types`.
 * That package declares the whole workerd global scope — `fetch`, `Request`,
 * `Headers` — which collides with the DOM and Node globals this Next app is
 * already compiled against. We touch exactly one method, so we describe
 * exactly one method.
 */
interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<AiRunOutput | string>;
}

async function binding(): Promise<AiBinding> {
  let env: CloudflareEnv | undefined;
  try {
    // `async: true` works both inside a request on workerd and under `next dev`,
    // where OpenNext proxies the bindings through wrangler.
    ({ env } = await getCloudflareContext({ async: true }));
  } catch {
    throw new ProviderUnavailableError();
  }
  const ai = env?.AI as AiBinding | undefined;
  if (!ai || typeof ai.run !== 'function') throw new ProviderUnavailableError();
  return ai;
}

/**
 * Setup failures (no binding, quota exhausted, a model name that no longer
 * exists) are the ones a user actually hits, and a generic "try again" wastes
 * their time. Translate those into an actionable message; anything else stays
 * generic so upstream internals are not echoed to the browser.
 *
 * @returns a safe message, or null when the cause is not a known setup problem.
 */
export function explainError(err: unknown): string | null {
  const m = err instanceof Error ? err.message : String(err ?? '');
  if (/no such model|model not found|not a valid model|InferenceUpstreamError/i.test(m)) {
    return `The model "${AI_MODEL}" is not available on Workers AI. Set AI_MODEL to one from the catalogue.`;
  }
  if (/capacity|quota|neuron|rate limit|429|too many requests/i.test(m)) {
    return 'The Workers AI daily allowance is used up. It resets at 00:00 UTC, or you can enable paid usage.';
  }
  if (/unauthor|forbidden|403|account/i.test(m)) {
    return 'Cloudflare rejected the inference request. Check that Workers AI is enabled on this account.';
  }
  if (/timed out|timeout|exceeded/i.test(m)) {
    return 'The model took too long to answer. Narrow the filters to send fewer records and try again.';
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

/** Workers AI returns `{ response }`, but a couple of models nest it. */
function readText(out: AiRunOutput | string): string {
  if (typeof out === 'string') return out;
  if (typeof out?.response === 'string') return out.response;
  if (typeof out?.result?.response === 'string') return out.result.response;
  return '';
}

/**
 * One non-streaming generation.
 *
 * @param json when true, ask for a JSON object back — used by the classifier
 *             and caption steps, which are parsed rather than shown. It also
 *             drops the temperature to 0, because those two steps must be
 *             reproducible: the same chronology should not classify as a
 *             different story shape on a second run.
 */
export async function generate(params: {
  system: string;
  user: string;
  maxTokens?: number;
  json?: boolean;
}): Promise<string> {
  const ai = await binding();
  const out = await ai.run(AI_MODEL, {
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.user },
    ],
    max_tokens: params.maxTokens ?? 4096,
    temperature: params.json ? 0 : 0.3,
    ...(params.json ? { response_format: { type: 'json_object' } } : {}),
  });
  return readText(out).trim();
}
