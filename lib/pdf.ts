/**
 * PDF hyperlink classification (PRD §2.2).
 *
 * The `Link To Pdf` cell *text* is the literal string "pdf"; the real URI is
 * the cell's hyperlink target (cell.l.Target). Targets fall into three kinds:
 *   real        — an actual produced document; link it, embed it if possible.
 *   placeholder — a `google.com/search?q=` stand-in; grey it out, do not link.
 *   none        — no hyperlink target at all.
 */

import type { PdfLink } from './types';

const DRIVE_FILE_ID = /\/file\/d\/([^/]+)/;
const DRIVE_OPEN_ID = /[?&]id=([^&]+)/;

/** A Google search URL is a placeholder — "no document produced". */
function isPlaceholder(target: string): boolean {
  return /google\.[^/]+\/search|www\.google\.[^/]+\/search|[?&]q=/.test(target);
}

/**
 * Google Drive `/view` links must become `/preview` to embed in an iframe.
 * Returns an embeddable URL, or null if the target isn't a recognized
 * embeddable form.
 */
export function toEmbedUrl(target: string): string | null {
  if (!/drive\.google\.com|docs\.google\.com/.test(target)) {
    // A direct .pdf is embeddable as-is; anything else we don't force into an iframe.
    return /\.pdf(\?|#|$)/i.test(target) ? target : null;
  }
  const fileMatch = target.match(DRIVE_FILE_ID);
  if (fileMatch) return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
  const openMatch = target.match(DRIVE_OPEN_ID);
  if (openMatch) return `https://drive.google.com/file/d/${openMatch[1]}/preview`;
  // Google Docs viewer form.
  return target.replace(/\/view(\?|$)/, '/preview$1');
}

export function classifyPdf(target: string | null | undefined): PdfLink {
  const t = (target ?? '').trim();
  if (!t) {
    return { kind: 'none', href: null, embedHref: null, note: 'no document produced' };
  }
  if (isPlaceholder(t)) {
    return { kind: 'placeholder', href: t, embedHref: null, note: 'no document produced' };
  }
  return { kind: 'real', href: t, embedHref: toEmbedUrl(t) };
}
