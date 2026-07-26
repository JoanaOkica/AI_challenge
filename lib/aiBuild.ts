/**
 * Client-safe builders that turn the resolved dashboard view into the payloads
 * the two AI modules consume. Framework-free (no React, no SDK) so it can
 * run in the browser before the fetch.
 */

import type { ResolvedRow, RegionComparison } from './types';
import type { ResolvedView } from './resolve';
import type { CaseData } from './types';
import type {
  AskRequest,
  AttorneyInputs,
  DemandRequest,
  PresentationInput,
  RegionStat,
  EventStat,
} from './ai';
import { toEncounterLite } from './ai';
import { buildCourtroom } from './courtroom';
import { classify } from './milestones';
import { fmtDateShort } from './format';

const MMI_RE = /maximum medical improvement|\bMMI\b/i;
const KEY_CATS = new Set(['SURGERY', 'EMS', 'ER', 'DISCHARGE', 'IME', 'LEGAL', 'WORKSTATUS']);

/** Non-suppressed rows passing the active filters, chronologically. */
function filteredRows(view: ResolvedView): ResolvedRow[] {
  return [...view.visibleRows].sort(
    (a, b) => +(a.encounterDate ?? 0) - +(b.encounterDate ?? 0),
  );
}

export function buildDemandRequest(view: ResolvedView, attorney: AttorneyInputs): DemandRequest {
  const rows = filteredRows(view);
  const analysis = buildCourtroom(view.allRows, view.tZeroDate);
  return {
    attorney,
    posture: analysis.posture,
    headline: analysis.headline,
    encounters: rows.map(toEncounterLite),
  };
}

/**
 * Q&A payload. Returns the rows alongside it because the model cites records by
 * their index in this array, and the UI maps those indices back to real rows.
 */
export function buildAskRequest(
  view: ResolvedView,
  question: string,
): { payload: AskRequest; rows: ResolvedRow[] } {
  const rows = filteredRows(view);
  return { payload: { question, encounters: rows.map(toEncounterLite) }, rows };
}

function toRegionStat(c: RegionComparison): RegionStat {
  return {
    label: c.label + (c.laterality ? ` (${c.laterality})` : ''),
    before: c.before,
    after: c.after,
    verdict: c.verdict,
    firstMention: fmtDateShort(c.firstMention),
  };
}

function keyEvents(rows: ResolvedRow[]): EventStat[] {
  const out: EventStat[] = [];
  for (const r of rows) {
    if (r.suppressed || !r.encounterDate) continue;
    const cat = classify(r.recordType);
    if (cat && KEY_CATS.has(cat.category)) {
      out.push({ date: fmtDateShort(r.encounterDate), label: cat.category, note: r.recordType });
    } else if (MMI_RE.test(r.summary ?? '')) {
      out.push({ date: fmtDateShort(r.encounterDate), label: 'MMI', note: 'Permanency assessment' });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function objectiveRecords(rows: ResolvedRow[]): EventStat[] {
  const out: EventStat[] = [];
  for (const r of rows) {
    if (r.suppressed || !r.encounterDate) continue;
    const cat = classify(r.recordType);
    const isMmi = MMI_RE.test(r.summary ?? '');
    if ((cat && (cat.category === 'IMAGING' || cat.category === 'SURGERY')) || isMmi) {
      out.push({
        date: fmtDateShort(r.encounterDate),
        label: r.recordType,
        note: r.summary?.slice(0, 140) ?? '',
      });
    }
  }
  return out;
}

export function buildPresentationInput(
  caseData: CaseData,
  view: ResolvedView,
  attorney: AttorneyInputs,
): PresentationInput {
  const analysis = buildCourtroom(view.allRows, view.tZeroDate);
  const dated = view.allRows.filter((r) => !r.suppressed);
  const gapDays = view.gaps.reduce((m, g) => Math.max(m, g.days), 0);
  const regions = view.comparison.map(toRegionStat);
  const regionCount =
    analysis.posture.newRegions.length +
    analysis.posture.aggravatedRegions.length +
    analysis.posture.preExistingRegions.length;

  return {
    caseName: caseData.name.replace(/^SAMPLE\s*—\s*/i, ''),
    headline: analysis.headline,
    incidentDate: attorney.incidentDate || (view.tZeroDate ? fmtDateShort(view.tZeroDate) : ''),
    posture: analysis.posture,
    regions,
    events: keyEvents(dated),
    objective: objectiveRecords(dated),
    kpis: {
      encounters: caseData.stats.encounterCount,
      milestones: view.nodes.length,
      surgeries: analysis.posture.surgeries,
      imaging: analysis.posture.imaging,
      imes: analysis.posture.imes,
      gapDays,
      mmi: analysis.posture.mmi,
      regions: regionCount || regions.length,
    },
  };
}
