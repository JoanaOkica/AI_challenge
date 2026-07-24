/**
 * The central selector: source case + Layer-2 overlay + UI filters -> the
 * derived view the UI renders. Pure functions, no React, so it's unit-testable.
 */

import type {
  CaseData,
  WorkProduct,
  ResolvedRow,
  Granularity,
  NodeCategory,
  GapBand,
  RegionComparison,
} from './types';
import { buildMilestones, classify, type MilestoneNode } from './milestones';
import type { NormalizedBodyPart, Region } from './bodyMap';
import { findGaps } from './gaps';
import { buildComparison } from './tzero';

export interface Filters {
  search: string;
  regions: Set<Region>;
  from: Date | null;
  to: Date | null;
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  regions: new Set(),
  from: null,
  to: null,
};

export interface TimelineNode {
  key: string;
  date: Date;
  category: NodeCategory;
  rows: ResolvedRow[];
  reason?: MilestoneNode['reason'];
  regions: Region[];
  parts: NormalizedBodyPart[];
  /** True if any row in the node is the T-Zero anchor. */
  isTZero: boolean;
}

export interface ResolvedView {
  /** Every row with the overlay applied (incl. suppressed), unfiltered. */
  allRows: ResolvedRow[];
  /** Non-suppressed rows passing the active filters. */
  visibleRows: ResolvedRow[];
  /** Suppressed rows passing the active filters — shown greyed in the table with a restore action. */
  suppressedRows: ResolvedRow[];
  /** Timeline nodes for the active granularity, built from visibleRows. */
  nodes: TimelineNode[];
  /** Rows to list in table view for the active granularity. */
  tableRows: ResolvedRow[];
  gaps: GapBand[];
  comparison: RegionComparison[];
  unassignedNoDate: ResolvedRow[];
  unassignedNoBody: ResolvedRow[];
  tZeroDate: Date | null;
  tZeroRow: ResolvedRow | null;
  dateExtent: { min: Date; max: Date } | null;
  suppressedCount: number;
}

function applyOverlay(caseData: CaseData, wp: WorkProduct): ResolvedRow[] {
  return caseData.rows.map((row) => ({
    ...row,
    starred: !!wp.starred[row.rowId],
    suppressed: !!wp.suppressed[row.rowId],
    note: wp.notes[row.rowId] ?? '',
    isTZero: wp.tZeroRowId === row.rowId,
  }));
}

function matchesFilters(row: ResolvedRow, f: Filters): boolean {
  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    const hay = `${row.summary}\n${row.provider}\n${row.facility}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.regions.size > 0) {
    if (!row.regions.some((r) => f.regions.has(r))) return false;
  }
  if (f.from && (!row.encounterDate || row.encounterDate < f.from)) return false;
  if (f.to && (!row.encounterDate || row.encounterDate > f.to)) return false;
  return true;
}

function unionParts(rows: ResolvedRow[]): NormalizedBodyPart[] {
  const seen = new Set<string>();
  const out: NormalizedBodyPart[] = [];
  for (const row of rows) {
    for (const p of row.bodyParts) {
      const key = `${p.id}|${p.laterality ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function unionRegions(parts: NormalizedBodyPart[]): Region[] {
  return [...new Set(parts.map((p) => p.region))];
}

function toTimelineNode(
  date: Date,
  category: NodeCategory,
  rows: ResolvedRow[],
  reason?: MilestoneNode['reason'],
): TimelineNode {
  const parts = unionParts(rows);
  return {
    key: `${date.toISOString().slice(0, 10)}|${category}|${reason ?? ''}`,
    date,
    category,
    rows,
    reason,
    parts,
    regions: unionRegions(parts),
    isTZero: rows.some((r) => r.isTZero),
  };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Milestone granularity: the §3.3 engine output. */
function milestoneNodes(rows: ResolvedRow[], tZeroRowId?: string): TimelineNode[] {
  const engineNodes = buildMilestones(rows, tZeroRowId);
  const byId = new Map(rows.map((r) => [r.rowId, r]));
  return engineNodes.map((n) => {
    const resolved = n.rows.map((r) => byId.get(r.rowId)!).filter(Boolean);
    return toTimelineNode(n.date, n.category, resolved, n.reason);
  });
}

/** "All flagged" granularity: §3.2 output, grouped by (date, category), no thinning. */
function flaggedNodes(rows: ResolvedRow[]): TimelineNode[] {
  const groups = new Map<string, { date: Date; category: NodeCategory; rows: ResolvedRow[] }>();
  for (const row of rows) {
    if (!row.encounterDate) continue;
    const rule = classify(row.recordType);
    if (!rule) continue;
    const key = `${isoDay(row.encounterDate)}|${rule.category}`;
    if (!groups.has(key)) groups.set(key, { date: row.encounterDate, category: rule.category, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  return [...groups.values()]
    .map((g) => toTimelineNode(g.date, g.category, g.rows, 'category'))
    .sort((a, b) => +a.date - +b.date);
}

/** "All encounters" granularity: one node per date, all rows on it. */
function encounterNodes(rows: ResolvedRow[]): TimelineNode[] {
  const groups = new Map<string, { date: Date; rows: ResolvedRow[] }>();
  for (const row of rows) {
    if (!row.encounterDate) continue;
    const key = isoDay(row.encounterDate);
    if (!groups.has(key)) groups.set(key, { date: row.encounterDate, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  return [...groups.values()]
    .map((g) => {
      // If every row on the day shares one milestone category, badge it; else neutral.
      const cats = new Set(g.rows.map((r) => classify(r.recordType)?.category).filter(Boolean));
      const category: NodeCategory = cats.size === 1 ? ([...cats][0] as NodeCategory) : 'ENCOUNTER';
      return toTimelineNode(g.date, category, g.rows);
    })
    .sort((a, b) => +a.date - +b.date);
}

export function resolveView(
  caseData: CaseData,
  wp: WorkProduct,
  granularity: Granularity,
  filters: Filters,
  gapDays: number,
): ResolvedView {
  const allRows = applyOverlay(caseData, wp);
  const notSuppressed = allRows.filter((r) => !r.suppressed);
  const suppressedCount = allRows.length - notSuppressed.length;

  const visibleRows = notSuppressed.filter((r) => matchesFilters(r, filters));
  const suppressedRows = allRows.filter((r) => r.suppressed && matchesFilters(r, filters));

  let nodes: TimelineNode[];
  let tableRows: ResolvedRow[];
  if (granularity === 'milestones') {
    nodes = milestoneNodes(visibleRows, wp.tZeroRowId);
    const keep = new Set(nodes.flatMap((n) => n.rows.map((r) => r.rowId)));
    tableRows = visibleRows.filter((r) => keep.has(r.rowId));
  } else if (granularity === 'flagged') {
    nodes = flaggedNodes(visibleRows);
    tableRows = visibleRows.filter((r) => classify(r.recordType));
  } else {
    nodes = encounterNodes(visibleRows);
    tableRows = visibleRows;
  }

  const tZeroRow = allRows.find((r) => r.isTZero) ?? null;
  const tZeroDate = tZeroRow?.encounterDate ?? null;

  const gaps = findGaps(visibleRows, gapDays);
  const comparison = buildComparison(notSuppressed, tZeroDate);

  const unassignedNoDate = notSuppressed.filter((r) => !r.encounterDate);
  const unassignedNoBody = notSuppressed.filter((r) => r.encounterDate && r.bodyParts.length === 0);

  const dated = visibleRows
    .map((r) => r.encounterDate)
    .filter((d): d is Date => !!d)
    .sort((a, b) => +a - +b);
  const dateExtent = dated.length ? { min: dated[0], max: dated[dated.length - 1] } : null;

  return {
    allRows,
    visibleRows,
    suppressedRows,
    nodes,
    tableRows: tableRows.sort((a, b) => (+(a.encounterDate ?? 0)) - +(b.encounterDate ?? 0)),
    gaps,
    comparison,
    unassignedNoDate,
    unassignedNoBody,
    tZeroDate,
    tZeroRow,
    dateExtent,
    suppressedCount,
  };
}
