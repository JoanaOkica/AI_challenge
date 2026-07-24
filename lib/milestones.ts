/**
 * Milestone engine.
 *
 * Principle: a Record Type tells you an event OCCURRED. A Summary keyword
 * tells you someone MENTIONED an event, often the same one for the fortieth
 * time — medical narratives restate the accident history in every note.
 * Only Record Type drives milestone selection.
 *
 * Verified output on the sample files:
 *   Caldwell 137 rows -> 9 nodes | Rogers 100 -> 6 | Middleswarth 49 -> 4
 *   Mercer 245 -> 32 | Garrison 820 -> 39
 */

export type MilestoneCategory =
  | 'SURGERY' | 'EMS' | 'ER' | 'DISCHARGE' | 'IME' | 'LEGAL' | 'IMAGING' | 'WORKSTATUS';

interface CategoryRule {
  category: MilestoneCategory;
  pattern: RegExp;
  /** null = always kept. Number = days that must pass before the same category yields another node. */
  cooldownDays: number | null;
}

/** Order matters — first match wins. */
const CATEGORY_RULES: CategoryRule[] = [
  { category: 'SURGERY',    pattern: /operative|surgic|surgery|post-?op|pre-?operative/,               cooldownDays: null },
  { category: 'EMS',        pattern: /\bems\b|ambulance|run report/,                                   cooldownDays: null },
  { category: 'ER',         pattern: /emergency (department|room)|triage/,                             cooldownDays: null },
  { category: 'DISCHARGE',  pattern: /discharge summary/,                                              cooldownDays: null },
  { category: 'IME',        pattern: /independent medical exam|\bime\b/,                               cooldownDays: null },
  { category: 'LEGAL',      pattern: /deposition|motion|affidavit/,                                    cooldownDays: null },
  // catches Rogers' "CT Report" / "MRI Report", which a bare "Imaging" keyword misses
  { category: 'IMAGING',    pattern: /imaging|radiolog|\bmri\b|\bct\b|x-?ray|ultrasound|\bemg\b|myelogram/, cooldownDays: 21 },
  { category: 'WORKSTATUS', pattern: /work abilit|work status|disability form|work restriction/,       cooldownDays: 90 },
];

const MMI = /maximum medical improvement|\bMMI\b/i;

export interface ChronologyRow {
  rowId: string;
  encounterDate: Date | null;
  recordType: string;
  summary: string;
  starred?: boolean;   // Layer 2: user "Mark as Milestone"
  suppressed?: boolean;
}

export interface MilestoneNode {
  date: Date;
  category: MilestoneCategory | 'ANCHOR';
  rows: ChronologyRow[];
  /** Why this node survived — show it in the UI so the selection is auditable. */
  reason: 'category' | 'first-record' | 'last-record' | 'user-starred' | 'first-mmi' | 't-zero';
}

export function classify(recordType: string): CategoryRule | null {
  const rt = (recordType ?? '').toLowerCase();
  return CATEGORY_RULES.find(r => r.pattern.test(rt)) ?? null;
}

const DAY = 86_400_000;

export function buildMilestones(rows: ChronologyRow[], tZeroRowId?: string): MilestoneNode[] {
  const live = rows.filter(r => !r.suppressed);
  const dated = live.filter(r => r.encounterDate instanceof Date && !isNaN(+r.encounterDate));

  // 1. group flagged rows by (date, category)
  const groups = new Map<string, { date: Date; rule: CategoryRule; rows: ChronologyRow[] }>();
  for (const row of dated) {
    const rule = classify(row.recordType);
    if (!rule) continue;
    const key = `${row.encounterDate!.toISOString().slice(0, 10)}|${rule.category}`;
    if (!groups.has(key)) groups.set(key, { date: row.encounterDate!, rule, rows: [] });
    groups.get(key)!.rows.push(row);
  }

  // 2. thin cooldown-tier categories
  const ordered = [...groups.values()].sort((a, b) => +a.date - +b.date);
  const lastSeen = new Map<MilestoneCategory, Date>();
  const nodes: MilestoneNode[] = [];

  for (const g of ordered) {
    const prev = lastSeen.get(g.rule.category);
    const withinCooldown =
      g.rule.cooldownDays !== null && prev !== undefined &&
      (+g.date - +prev) / DAY < g.rule.cooldownDays;
    if (withinCooldown) continue;
    lastSeen.set(g.rule.category, g.date);
    nodes.push({ date: g.date, category: g.rule.category, rows: g.rows, reason: 'category' });
  }

  // 3. force-keeps
  const have = new Set(nodes.flatMap(n => n.rows.map(r => r.rowId)));
  const push = (row: ChronologyRow, reason: MilestoneNode['reason']) => {
    if (!row?.encounterDate || have.has(row.rowId)) return;
    have.add(row.rowId);
    nodes.push({ date: row.encounterDate, category: 'ANCHOR', rows: [row], reason });
  };

  const byDate = [...dated].sort((a, b) => +a.encounterDate! - +b.encounterDate!);
  push(byDate[0], 'first-record');
  push(byDate[byDate.length - 1], 'last-record');
  if (tZeroRowId) push(live.find(r => r.rowId === tZeroRowId)!, 't-zero');
  for (const r of live.filter(r => r.starred)) push(r, 'user-starred');
  const firstMmi = byDate.find(r => MMI.test(r.summary ?? ''));
  if (firstMmi) push(firstMmi, 'first-mmi');

  return nodes.sort((a, b) => +a.date - +b.date);
}

/** Rows that can't be placed on the timeline. Not errors — route to the Unassigned drawer. */
export function unassigned(rows: ChronologyRow[]) {
  return {
    noDate: rows.filter(r => !(r.encounterDate instanceof Date) || isNaN(+r.encounterDate!)),
  };
}
