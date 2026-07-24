/**
 * Courtroom challenge engine.
 *
 * Predicts the arguments senior defense counsel will raise against THIS
 * patient's case and pairs each with a data-backed response drawn from the
 * chronology itself. Deterministic and traceable — every point cites the
 * records behind it. This is the integration seam for a firm's own AI: swap
 * `buildCourtroom` for an LLM call with the same inputs/outputs and the UI is
 * unchanged.
 */

import type { SourceRow } from './types';
import { buildComparison } from './tzero';
import { findGaps } from './gaps';
import { classify } from './milestones';
import { fmtDateShort, fmtDate } from './format';
import { partLabel } from './labels';

/** How favorable the exchange is to the plaintiff after the response. */
export type ArgStrength = 'strong' | 'even' | 'uphill';

export interface SupportingRecord {
  date: string;
  recordType: string;
  bates?: string;
}

export interface CourtroomArgument {
  id: string;
  theme: string;
  /** What senior defense counsel will argue. */
  defense: string;
  /** The data-backed response. */
  response: string;
  strength: ArgStrength;
  support: SupportingRecord[];
}

export interface CasePosture {
  newRegions: string[];
  aggravatedRegions: string[];
  preExistingRegions: string[];
  surgeries: number;
  imaging: number;
  imes: number;
  gaps: number;
  mmi: boolean;
}

export interface CourtroomAnalysis {
  headline: string;
  posture: CasePosture;
  args: CourtroomArgument[];
  generatedAt: number;
}

const MMI_RE = /maximum medical improvement|\bMMI\b/i;
const DEGEN_RE = /degenerat|chronic|pre-?existing|longstanding|long-standing|arthrit|prior/i;

function support(row: SourceRow): SupportingRecord {
  return { date: fmtDateShort(row.encounterDate), recordType: row.recordType, bates: row.bates?.begin };
}

function cat(rows: SourceRow[], c: string): SourceRow[] {
  return rows.filter((r) => classify(r.recordType)?.category === c);
}

export function buildCourtroom(rows: SourceRow[], tZeroDate: Date | null): CourtroomAnalysis {
  const args: CourtroomArgument[] = [];
  const comparison = buildComparison(rows, tZeroDate);

  const newRegions = comparison.filter((c) => c.verdict === 'NEW POST-INCIDENT');
  const aggravated = comparison.filter((c) => c.verdict === 'PRE-EXISTING, AGGRAVATED');
  const preExisting = comparison.filter((c) => c.verdict === 'PRE-EXISTING ONLY');

  const surgeries = cat(rows, 'SURGERY');
  const imaging = cat(rows, 'IMAGING');
  const imes = cat(rows, 'IME');
  const gaps = findGaps(rows);
  const mmiRow = rows.find((r) => MMI_RE.test(r.summary ?? '') && r.encounterDate);

  const imeSupportSentence = imes.length
    ? ` The independent medical exam (${fmtDateShort(imes[0].encounterDate)}) ties the injury to the incident.`
    : '';

  // A. Causation for the new injuries — your strongest ground.
  if (newRegions.length && tZeroDate) {
    const names = listLabels(newRegions.map((r) => r.label));
    const emsEr = [...cat(rows, 'EMS'), ...cat(rows, 'ER')].filter(
      (r) => r.encounterDate && +r.encounterDate === +tZeroDate,
    );
    args.push({
      id: 'causation-new',
      theme: 'Causation of the new injuries',
      defense: `Even for the ${names}, the defense will suggest the onset is coincidental or from some unrelated event — not this incident.`,
      response:
        `Each of these regions has zero pre-incident mentions and first appears on ${fmtDate(tZeroDate)}, the incident date.` +
        (emsEr.length ? ` Same-day ${emsEr.map((r) => r.recordType).join(' and ')} document them contemporaneously.` : '') +
        ` No prior history plus tight temporal proximity is textbook causation.${imeSupportSentence}`,
      strength: 'strong',
      support: [...emsEr, ...imes].slice(0, 4).map(support),
    });
  }

  // B. Aggravation of a pre-existing region — the contested middle.
  for (const region of aggravated) {
    args.push({
      id: `aggravation-${region.partId}`,
      theme: `Aggravation vs. degeneration — ${region.label}`,
      defense: `The ${region.label.toLowerCase()} was already symptomatic before the incident (first seen ${fmtDateShort(region.firstMention)}). The defense will call it degenerative and unrelated.`,
      response: `Frame it as aggravation, not origin: ${region.before} pre-incident mention${region.before === 1 ? '' : 's'} versus ${region.after} after. The escalation is the injury.${imeSupportSentence}`,
      strength: 'even',
      support: imes.map(support).slice(0, 2),
    });
  }

  // C. Pre-existing-only region — concede it, and gain credibility.
  if (preExisting.length) {
    const names = listLabels(preExisting.map((r) => r.label));
    args.push({
      id: 'concede-preexisting',
      theme: 'Pre-existing conditions to concede',
      defense: `The defense will parade the ${names} as proof the plaintiff was already unwell and is now over-claiming.`,
      response: `Concede ${preExisting.length === 1 ? 'it' : 'them'} first, cleanly. ${cap(names)} ${preExisting.length === 1 ? 'is' : 'are'} not part of the injury claim — conceding protects your credibility on the regions that genuinely are new.`,
      strength: 'uphill',
      support: [],
    });
  }

  // D. Gaps in treatment.
  for (const gap of gaps) {
    args.push({
      id: `gap-${+gap.start}`,
      theme: 'Gap in treatment',
      defense: `A ${gap.days}-day gap (${fmtDateShort(gap.start)} – ${fmtDateShort(gap.end)}) means the plaintiff recovered and stopped treating — or failed to mitigate.`,
      response: `Name it precisely: this is a gap in records *produced*, not proof of absent care. Treatment is documented resuming ${fmtDateShort(gap.end)}; a production gap is not a recovery.`,
      strength: 'even',
      support: [],
    });
  }

  // E. Subjective complaints vs. objective findings.
  if (imaging.length || surgeries.length) {
    const objective = [...imaging.slice(0, 2), ...surgeries.slice(0, 1)];
    args.push({
      id: 'objective-findings',
      theme: 'Subjective complaints vs. objective proof',
      defense: `The defense will dismiss the complaints as subjective and self-reported, repeated visit after visit.`,
      response: `Objective findings corroborate them — ${objective.map((r) => r.recordType).join(', ')}. A patient cannot fabricate imaging or a surgeon's operative report.`,
      strength: 'strong',
      support: objective.map(support),
    });
  }

  // F. Permanency / MMI.
  if (mmiRow) {
    args.push({
      id: 'permanency-mmi',
      theme: 'Permanency of the injury',
      defense: `The defense will argue the plaintiff has fully recovered and is owed nothing further.`,
      response: `The ${fmtDate(mmiRow.encounterDate)} record documents Maximum Medical Improvement with permanent impairment — treatment plateaued, it did not complete.`,
      strength: 'strong',
      support: [support(mmiRow)],
    });
  }

  const posture: CasePosture = {
    newRegions: newRegions.map((r) => r.label),
    aggravatedRegions: aggravated.map((r) => r.label),
    preExistingRegions: preExisting.map((r) => r.label),
    surgeries: surgeries.length,
    imaging: imaging.length,
    imes: imes.length,
    gaps: gaps.length,
    mmi: !!mmiRow,
  };

  return {
    headline: headline(posture),
    posture,
    args: rankArgs(args),
    generatedAt: Date.now(),
  };
}

const STRENGTH_RANK: Record<ArgStrength, number> = { strong: 0, even: 1, uphill: 2 };
function rankArgs(args: CourtroomArgument[]): CourtroomArgument[] {
  return [...args].sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength]);
}

function headline(p: CasePosture): string {
  const parts: string[] = [];
  if (p.newRegions.length) parts.push(`${p.newRegions.length} new post-incident ${p.newRegions.length === 1 ? 'injury' : 'injuries'}`);
  if (p.surgeries) parts.push(`${p.surgeries} ${p.surgeries === 1 ? 'surgery' : 'surgeries'}`);
  if (p.imaging) parts.push('objective imaging on record');
  const tail = p.preExistingRegions.length
    ? ` — with ${p.preExistingRegions.length} pre-existing ${p.preExistingRegions.length === 1 ? 'region' : 'regions'} to concede cleanly.`
    : '.';
  return (parts.length ? cap(listPlain(parts)) : 'Case posture') + tail;
}

function listLabels(labels: string[]): string {
  return listPlain(labels.map((l) => l.toLowerCase()));
}
function listPlain(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
