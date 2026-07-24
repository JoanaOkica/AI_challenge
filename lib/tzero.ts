/**
 * Pre/post T-Zero comparison (PRD §6) — the causation fight in one table.
 *
 * For each normalized body part: encounters before the incident anchor vs.
 * after, first mention date, and a verdict. Convention: the incident-day
 * encounter (date === T-Zero) counts as post-incident.
 */

import type { SourceRow, RegionComparison, CausationVerdict } from './types';
import { partLabel } from './labels';
import type { Laterality, Region } from './bodyMap';

function verdictFor(before: number, after: number): CausationVerdict {
  if (before > 0 && after > 0) return 'PRE-EXISTING, AGGRAVATED';
  if (before === 0 && after > 0) return 'NEW POST-INCIDENT';
  return 'PRE-EXISTING ONLY';
}

interface Acc {
  partId: string;
  region: Region;
  before: number;
  after: number;
  firstMention: Date | null;
  lateralities: Set<Laterality>;
}

/**
 * @param rows      all source rows for the case (null-date rows are ignored here)
 * @param tZeroDate the incident anchor date; null disables the comparison
 */
export function buildComparison(rows: SourceRow[], tZeroDate: Date | null): RegionComparison[] {
  if (!tZeroDate) return [];
  const acc = new Map<string, Acc>();

  for (const row of rows) {
    if (!row.encounterDate) continue;
    const isAfter = +row.encounterDate >= +tZeroDate;
    for (const part of row.bodyParts) {
      let a = acc.get(part.id);
      if (!a) {
        a = {
          partId: part.id,
          region: part.region,
          before: 0,
          after: 0,
          firstMention: null,
          lateralities: new Set(),
        };
        acc.set(part.id, a);
      }
      if (isAfter) a.after++;
      else a.before++;
      if (part.laterality) a.lateralities.add(part.laterality);
      if (!a.firstMention || row.encounterDate < a.firstMention) a.firstMention = row.encounterDate;
    }
  }

  const rowsOut: RegionComparison[] = [...acc.values()].map((a) => {
    const sides = [...a.lateralities].filter(Boolean) as string[];
    const laterality = sides.length === 1 ? sides[0] : null;
    return {
      partId: a.partId,
      label: partLabel(a.partId),
      region: a.region,
      laterality,
      before: a.before,
      after: a.after,
      firstMention: a.firstMention,
      verdict: verdictFor(a.before, a.after),
    };
  });

  // Most probative first: new post-incident, then aggravated, then pre-existing;
  // within a verdict, the most-documented parts first.
  const order: Record<CausationVerdict, number> = {
    'NEW POST-INCIDENT': 0,
    'PRE-EXISTING, AGGRAVATED': 1,
    'PRE-EXISTING ONLY': 2,
  };
  return rowsOut.sort(
    (x, y) => order[x.verdict] - order[y.verdict] || y.before + y.after - (x.before + x.after),
  );
}
