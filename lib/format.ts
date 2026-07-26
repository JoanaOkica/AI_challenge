/** Small display + parsing helpers. */

/**
 * Parse a date defensively (PRD §2.2). Samples are MM/DD/YYYY, but Excel may
 * hand us a Date object (cellDates: true), a serial number, or free text.
 * Unparseable → null (the row is still valid; it routes to the Unassigned
 * drawer and never crashes the timeline).
 */
export function parseDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isNaN(+value) ? null : stripTime(value);

  if (typeof value === 'number') {
    // Excel serial date (days since 1899-12-30).
    if (value > 0 && value < 100000) {
      const ms = Math.round((value - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return isNaN(+d) ? null : stripTime(d);
    }
    return null;
  }

  const s = String(value).trim();
  if (!s) return null;

  // MM/DD/YYYY or MM-DD-YYYY (and 2-digit years).
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const [, mm, dd, yy] = m;
    let year = parseInt(yy, 10);
    if (yy.length === 2) year += year < 50 ? 2000 : 1900;
    const d = new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10));
    return isNaN(+d) ? null : stripTime(d);
  }

  // ISO-ish or anything Date can handle.
  const parsed = new Date(s);
  return isNaN(+parsed) ? null : stripTime(parsed);
}

/** Normalize to local midnight so day-level grouping is stable. */
export function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(d: Date | null): string {
  if (!d || isNaN(+d)) return '—';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function fmtDateShort(d: Date | null): string {
  if (!d || isNaN(+d)) return '—';
  const yy = String(d.getFullYear()).slice(2);
  return `${d.getMonth() + 1}/${d.getDate()}/${yy}`;
}

export function fmtDateISO(d: Date | null): string {
  if (!d || isNaN(+d)) return '';
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((+b - +a) / 86_400_000);
}

/** Human-readable duration for a day span. */
export function fmtSpan(start: Date | null, end: Date | null): string {
  if (!start || !end) return '—';
  const days = daysBetween(start, end);
  if (days < 45) return `${days} days`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

export function pluralize(n: number, word: string, plural?: string): string {
  return `${n} ${n === 1 ? word : plural ?? word + 's'}`;
}

/** Case-insensitive "cell has a value" check that treats whitespace as empty. */
export function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}
