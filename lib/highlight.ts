/**
 * Mark matched keywords in Summary text (PRD §5.4).
 *
 * Three kinds are surfaced:
 *   mmi      — "maximum medical improvement" / MMI (a force-keep milestone)
 *   event    — event keywords that echo the milestone categories
 *   bodypart — the row's own Body Parts tokens where they appear in the prose
 *
 * These are demonstrative highlights, not the milestone selection itself
 * (which is driven by Record Type, never by Summary).
 */

export type HighlightKind = 'mmi' | 'event' | 'bodypart';

export interface Segment {
  text: string;
  kind?: HighlightKind;
}

const MMI_RE = /maximum medical improvement|\bMMI\b/gi;
const EVENT_RE =
  /operative|surger(?:y|ies)|surgical|post-?op|discharge summary|emergency (?:department|room)|triage|ambulance|run report|deposition|affidavit|independent medical exam|\bIME\b|\bMRI\b|\bCT\b|x-?ray|myelogram|\bEMG\b|ultrasound|radiolog\w*|work status|work restriction|work abilit\w*/gi;

interface Range {
  start: number;
  end: number;
  kind: HighlightKind;
}

function collect(re: RegExp, text: string, kind: HighlightKind, into: Range[]): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    into.push({ start: m.index, end: m.index + m[0].length, kind });
  }
}

function bodyPartRegex(tokens: string[]): RegExp | null {
  const words = tokens
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length === 0) return null;
  return new RegExp(`\\b(?:${words.join('|')})\\b`, 'gi');
}

/**
 * @param summary       the Summary text
 * @param bodyPartCell  the raw Body Parts cell (comma-separated), for prose highlights
 */
export function highlightSummary(summary: string, bodyPartCell = ''): Segment[] {
  if (!summary) return [{ text: '' }];

  const ranges: Range[] = [];
  collect(MMI_RE, summary, 'mmi', ranges);
  collect(EVENT_RE, summary, 'event', ranges);
  const bpRe = bodyPartRegex(bodyPartCell.split(','));
  if (bpRe) collect(bpRe, summary, 'bodypart', ranges);

  if (ranges.length === 0) return [{ text: summary }];

  // Priority: mmi > event > bodypart. Sort by start, then priority; drop overlaps.
  const priority: Record<HighlightKind, number> = { mmi: 0, event: 1, bodypart: 2 };
  ranges.sort((a, b) => a.start - b.start || priority[a.kind] - priority[b.kind]);

  const merged: Range[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue; // overlaps a higher-priority earlier range
    merged.push(r);
    cursor = r.end;
  }

  const segments: Segment[] = [];
  let pos = 0;
  for (const r of merged) {
    if (r.start > pos) segments.push({ text: summary.slice(pos, r.start) });
    segments.push({ text: summary.slice(r.start, r.end), kind: r.kind });
    pos = r.end;
  }
  if (pos < summary.length) segments.push({ text: summary.slice(pos) });
  return segments;
}
