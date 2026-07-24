/**
 * Server-only Anthropic client helpers. NEVER import this from a client
 * component — it pulls in the SDK and reads the API key from the environment.
 * Only the API route handlers under app/api/* import this module.
 */

import Anthropic from '@anthropic-ai/sdk';

export const CLAUDE_MODEL = 'claude-opus-4-8';

export class MissingKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set on the server.');
    this.name = 'MissingKeyError';
  }
}

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingKeyError();
  if (!client) client = new Anthropic();
  return client;
}

/** Concatenate the text blocks of a message into one string. */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/**
 * Pull the first well-formed JSON object out of a model response. The model is
 * asked to return only JSON, but this tolerates stray prose or code fences.
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
 * A plain non-streaming request. `adaptive` thinking + `high` effort are passed
 * through as request fields the installed SDK version does not yet type; the
 * API accepts them on Opus 4.8.
 */
export async function createMessage(params: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<Anthropic.Message> {
  const c = getClient();
  return c.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: params.maxTokens ?? 4096,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: params.system,
    messages: [{ role: 'user', content: params.user }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}
