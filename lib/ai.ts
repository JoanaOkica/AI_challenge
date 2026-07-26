/**
 * Shared types + client-side payload builders for the two Gemini-powered
 * modules: the demand-narrative drafter (Case Builder) and the court
 * presentation classifier (Court Presentation).
 *
 * Everything here is framework-free so it can be imported from both the React
 * client (to assemble the request from the resolved view) and the Next.js API
 * routes (to type the request/response). No server-only imports.
 */

import type { ResolvedRow, RegionComparison } from './types';
import type { CasePosture } from './courtroom';
import { fmtDateShort, fmtDateISO } from './format';
import { classify } from './milestones';
import { partLabel } from './labels';

/* ------------------------------------------------------------------ *
 * Compact encounter shape sent to Gemini — only what a demand letter  *
 * needs, never the attorney work product.                            *
 * ------------------------------------------------------------------ */

export interface EncounterLite {
  /** ISO date (YYYY-MM-DD) or '' when undated. */
  dateISO: string;
  /** MM/DD/YY display form — this is the citation the model must use. */
  date: string;
  category: string;
  recordType: string;
  provider: string;
  facility: string;
  /** Human-readable region labels touched by the encounter. */
  regions: string[];
  summary: string;
  bates?: string;
}

export function toEncounterLite(row: ResolvedRow): EncounterLite {
  const cat = classify(row.recordType);
  const regionLabels = [...new Set(row.bodyParts.map((p) => partLabel(p.id)))];
  return {
    dateISO: fmtDateISO(row.encounterDate),
    date: fmtDateShort(row.encounterDate),
    category: cat?.category ?? 'ENCOUNTER',
    recordType: row.recordType,
    provider: row.provider,
    facility: row.facility,
    regions: regionLabels,
    summary: row.summary,
    bates: row.bates?.begin,
  };
}

/* ------------------------------------------------------------------ *
 * Demand narrative (Case Builder)                                     *
 * ------------------------------------------------------------------ */

export interface AttorneyInputs {
  clientName: string;
  defendant: string;
  incidentDate: string;
  incidentDescription: string;
  jurisdiction: string;
  /** Free-text: liability theory, damages emphasis, tone notes. */
  emphasis: string;
}

export const EMPTY_ATTORNEY_INPUTS: AttorneyInputs = {
  clientName: '',
  defendant: '',
  incidentDate: '',
  incidentDescription: '',
  jurisdiction: '',
  emphasis: '',
};

export interface DemandRequest {
  attorney: AttorneyInputs;
  posture: CasePosture;
  headline: string;
  encounters: EncounterLite[];
}

export interface DemandResponse {
  /** The medical-narrative section, plain text with paragraph breaks. */
  narrative: string;
  model: string;
}

/* ------------------------------------------------------------------ *
 * Ask the record (Q&A over the chronology)                            *
 * ------------------------------------------------------------------ */

export interface AskRequest {
  question: string;
  /** Chronological; the array index is the id the model cites. */
  encounters: EncounterLite[];
}

export interface AskResponse {
  answer: string;
  /** Indices into the request's `encounters` — the records behind the answer. */
  citedIds: number[];
  model: string;
}

/** Starter questions, matching how a lawyer opens a file. */
export const ASK_SUGGESTIONS = [
  'When was the surgery?',
  'Which injuries are new since the incident?',
  'Was there a gap in treatment?',
  'What objective proof is there?',
  'Has the client reached MMI?',
  'Who treated the knee?',
];

/* ------------------------------------------------------------------ *
 * Court presentation (two-step: classify -> caption)                  *
 * ------------------------------------------------------------------ */

export type CaseShape = 'before_after' | 'escalation_arc' | 'persistence' | 'multi_trauma';

export const SHAPE_LABELS: Record<CaseShape, string> = {
  before_after: 'Before / After',
  escalation_arc: 'Escalation Arc',
  persistence: 'Persistence',
  multi_trauma: 'Multi-Trauma',
};

export const SHAPE_BLURB: Record<CaseShape, string> = {
  before_after: 'A healthy baseline, then a sharp break at the incident.',
  escalation_arc: 'Injuries that deepened over time — from complaint to surgery.',
  persistence: 'Pain that never resolved, all the way to permanency.',
  multi_trauma: 'One event, many injured body regions at once.',
};

/** A region row, condensed for the jury deck. */
export interface RegionStat {
  label: string;
  before: number;
  after: number;
  verdict: RegionComparison['verdict'];
  firstMention: string;
}

export interface EventStat {
  date: string;
  label: string;
  note: string;
}

export interface PresentationKpis {
  encounters: number;
  milestones: number;
  surgeries: number;
  imaging: number;
  imes: number;
  gapDays: number;
  mmi: boolean;
  regions: number;
}

/** Everything the deck can draw from — computed deterministically client-side. */
export interface PresentationInput {
  caseName: string;
  headline: string;
  incidentDate: string;
  posture: CasePosture;
  regions: RegionStat[];
  events: EventStat[];
  objective: EventStat[];
  kpis: PresentationKpis;
}

export type SlideTemplate =
  | 'title'
  | 'stat_compare'
  | 'region_grid'
  | 'timeline'
  | 'stat_row'
  | 'quote_records';

export interface Slide {
  id: string;
  template: SlideTemplate;
  heading: string;
  /** Deterministic real data for the template to render. */
  data: unknown;
  /** Jury-facing caption, reading age 12 — written by the LLM. */
  caption: string;
}

export interface PresentationResponse {
  shape: CaseShape;
  rationale: string;
  slides: Slide[];
  model: string;
}
