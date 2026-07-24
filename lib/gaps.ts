/**
 * Gap bands (PRD §5.2).
 *
 * Stretches where no records exist for more than N days. Labelled
 * "Gap in records produced" — NOT "gap in care": records may simply never
 * have been produced, and asserting the plaintiff stopped treating hands the
 * defense an argument that may not be true.
 */

import type { SourceRow, GapBand } from './types';
import { daysBetween } from './format';

export const DEFAULT_GAP_DAYS = 60;

export function findGaps(rows: SourceRow[], minDays = DEFAULT_GAP_DAYS): GapBand[] {
  const dates = rows
    .map((r) => r.encounterDate)
    .filter((d): d is Date => d instanceof Date && !isNaN(+d))
    .sort((a, b) => +a - +b);

  const gaps: GapBand[] = [];
  for (let i = 1; i < dates.length; i++) {
    const days = daysBetween(dates[i - 1], dates[i]);
    if (days > minDays) {
      gaps.push({ start: dates[i - 1], end: dates[i], days });
    }
  }
  return gaps;
}
