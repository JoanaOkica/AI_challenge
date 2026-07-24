/**
 * Shared domain model.
 *
 * Two-layer design (PRD §2.4):
 *   Layer 1 (SourceRow / CaseData) — read-only, never mutated.
 *   Layer 2 (WorkProduct)          — notes, stars, suppressions, T-Zero.
 *                                     Separate store, excluded from exports.
 */

import type { ChronologyRow, MilestoneCategory } from './milestones';
import type { NormalizedBodyPart, Region } from './bodyMap';

/** Classification of the `Link To Pdf` hyperlink target (PRD §2.2). */
export type PdfKind = 'real' | 'placeholder' | 'none';

export interface PdfLink {
  kind: PdfKind;
  /** The raw hyperlink target from the cell (cell.l.Target), if any. */
  href: string | null;
  /** Google Drive `/view` rewritten to `/preview` for iframe embedding. Null unless embeddable. */
  embedHref: string | null;
  /** Reason a target was classed placeholder/none — shown in a tooltip. */
  note?: string;
}

export interface Bates {
  begin?: string;
  end?: string;
  page?: string;
}

/**
 * A single ingested chronology row (Layer 1).
 * Structurally a superset of ChronologyRow so it can be passed straight to
 * the milestone engine.
 */
export interface SourceRow extends ChronologyRow {
  /** Content hash (PRD §2.3). Stable across re-export. */
  rowId: string;
  /** 0-based position in the source sheet — for reference/debugging only. */
  sheetRow: number;

  encounterDate: Date | null;
  /** Original date cell as text, preserved for provenance. */
  encounterDateRaw: string;

  provider: string;
  facility: string;
  medicineType: string;
  recordType: string;
  summary: string;

  /** Raw `Body Parts` cell text. */
  bodyPartsRaw: string;
  /** Normalized, de-duplicated body parts (PRD §4). */
  bodyParts: NormalizedBodyPart[];
  /** Regions touched by this row (derived from bodyParts). */
  regions: Region[];

  pdf: PdfLink;
  bates?: Bates;
  /** Present in schema but cut from the UI (PRD §0). Kept for provenance only. */
  cost?: string;
}

export interface CaseStats {
  encounterCount: number;
  dateSpan: { start: Date | null; end: Date | null };
  providerCount: number;
  facilityCount: number;
  recordTypeBreakdown: { recordType: string; count: number }[];
  nullDateCount: number;
  nullBodyPartCount: number;
  pdfBreakdown: Record<PdfKind, number>;
}

/** One ingested workbook = one workspace/case. */
export interface CaseData {
  /** Stable id: derived from file name so notes survive re-upload. */
  id: string;
  name: string;
  fileName: string;
  ingestedAt: number;
  rows: SourceRow[];
  stats: CaseStats;
  /** Non-fatal problems encountered during ingest, surfaced to the user. */
  warnings: string[];
}

/** Layer 2 — attorney work product. Never merged into Layer 1, never exported. */
export interface WorkProduct {
  isWorkProduct: true;
  /** rowId -> free-text note. */
  notes: Record<string, string>;
  /** rowId -> user "Mark as Milestone". */
  starred: Record<string, boolean>;
  /** rowId -> user suppression (hide from timeline). */
  suppressed: Record<string, boolean>;
  /** The T-Zero anchor row (incident date). */
  tZeroRowId?: string;
}

export function emptyWorkProduct(): WorkProduct {
  return { isWorkProduct: true, notes: {}, starred: {}, suppressed: {} };
}

/**
 * A source row with the Layer-2 overlay applied. This is what the milestone
 * engine and UI actually consume. The `starred`/`suppressed` flags come from
 * work product, never from the source sheet.
 */
export type ResolvedRow = SourceRow & {
  starred?: boolean;
  suppressed?: boolean;
  note?: string;
  isTZero?: boolean;
};

export type Granularity = 'milestones' | 'flagged' | 'all';

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  milestones: 'Milestones',
  flagged: 'All flagged',
  all: 'All encounters',
};

/** Verdict for the pre/post T-Zero causation table (PRD §6). */
export type CausationVerdict =
  | 'NEW POST-INCIDENT'
  | 'PRE-EXISTING, AGGRAVATED'
  | 'PRE-EXISTING ONLY';

export interface RegionComparison {
  /** Normalized part id (bodyMap `id`). */
  partId: string;
  label: string;
  region: Region;
  laterality: string | null;
  before: number;
  after: number;
  firstMention: Date | null;
  verdict: CausationVerdict;
}

export interface GapBand {
  start: Date;
  end: Date;
  days: number;
}

/** Node category, including UI-only kinds not produced by the engine. */
export type NodeCategory = MilestoneCategory | 'ANCHOR' | 'ENCOUNTER';

/** Milestone category badge palette — presence, not severity. */
export const CATEGORY_META: Record<
  NodeCategory,
  { label: string; className: string }
> = {
  SURGERY:    { label: 'Surgery',      className: 'bg-rose-100 text-rose-800 ring-rose-200' },
  EMS:        { label: 'EMS',          className: 'bg-orange-100 text-orange-800 ring-orange-200' },
  ER:         { label: 'ER',           className: 'bg-amber-100 text-amber-800 ring-amber-200' },
  DISCHARGE:  { label: 'Discharge',    className: 'bg-lime-100 text-lime-800 ring-lime-200' },
  IME:        { label: 'IME',          className: 'bg-violet-100 text-violet-800 ring-violet-200' },
  LEGAL:      { label: 'Legal',        className: 'bg-slate-200 text-slate-800 ring-slate-300' },
  IMAGING:    { label: 'Imaging',      className: 'bg-sky-100 text-sky-800 ring-sky-200' },
  WORKSTATUS: { label: 'Work status',  className: 'bg-teal-100 text-teal-800 ring-teal-200' },
  ANCHOR:     { label: 'Anchor',       className: 'bg-indigo-100 text-indigo-800 ring-indigo-200' },
  ENCOUNTER:  { label: 'Encounter',    className: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

export const REGION_LABELS: Record<Region, string> = {
  HEAD: 'Head / face',
  MIND: 'Mind / psych',
  NECK: 'Neck (cervical)',
  TORSO: 'Torso / spine',
  UPPER_EXT: 'Upper extremity',
  LOWER_EXT: 'Lower extremity',
  SYSTEMIC: 'Systemic',
};
