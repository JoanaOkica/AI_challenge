/**
 * Client-side helper for the two AI endpoints.
 *
 * When the deployment sets APP_ACCESS_CODE, every request must carry it. The
 * code is held in localStorage so a lawyer types it once per browser; it is
 * never bundled into the app, so the built JS contains no secret.
 */

const CODE_KEY = 'cp:accessCode';

export function getAccessCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAccessCode(code: string): void {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    /* storage unavailable — the code lives for this page load only */
  }
}

/** Thrown when the server wants an access code we do not have (or it's wrong). */
export class AccessRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessRequiredError';
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const code = getAccessCode();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(code ? { 'x-access-code': code } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (res.status === 401 && (data as { code?: string }).code === 'access_required') {
    throw new AccessRequiredError(
      code
        ? 'That access code was not accepted. Check it and try again.'
        : 'This deployment is protected. Enter the access code to continue.',
    );
  }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status}).`);
  }
  return data as T;
}
