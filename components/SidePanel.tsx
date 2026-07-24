'use client';

import { useMemo, useState } from 'react';
import type { CaseData, ResolvedRow, RegionComparison } from '@/lib/types';
import { fmtDate, fmtDateShort, fmtSpan, pluralize } from '@/lib/format';
import { classify } from '@/lib/milestones';
import { partLabel } from '@/lib/labels';
import { CategoryBadge, VerdictBadge, PdfBadge } from './ui';

interface SidePanelProps {
  caseData: CaseData;
  allRows: ResolvedRow[];
  comparison: RegionComparison[];
  tZeroDate: Date | null;
  unassignedNoDate: ResolvedRow[];
  unassignedNoBody: ResolvedRow[];
  onOpenRow: (row: ResolvedRow) => void;
  onPickTZeroPrompt: () => void;
}

const MMI_RE = /maximum medical improvement|\bMMI\b/i;

export default function SidePanel(props: SidePanelProps) {
  return (
    <aside className="flex w-full flex-col gap-4">
      <CaseOverview caseData={props.caseData} />
      <PrePostTable
        comparison={props.comparison}
        tZeroDate={props.tZeroDate}
        onPickTZeroPrompt={props.onPickTZeroPrompt}
      />
      <KeyEvents allRows={props.allRows} onOpenRow={props.onOpenRow} />
      <UnassignedDrawer
        noDate={props.unassignedNoDate}
        noBody={props.unassignedNoBody}
        onOpenRow={props.onOpenRow}
      />
    </aside>
  );
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-100">
      <div className="text-lg font-bold leading-tight text-slate-800">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function CaseOverview({ caseData }: { caseData: CaseData }) {
  const { stats } = caseData;
  const max = Math.max(1, ...stats.recordTypeBreakdown.map((r) => r.count));
  const top = stats.recordTypeBreakdown.slice(0, 8);
  const rest = stats.recordTypeBreakdown.length - top.length;

  return (
    <Panel title="Case overview">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Encounters" value={stats.encounterCount} />
        <Stat label="Providers" value={stats.providerCount} />
        <Stat label="Facilities" value={stats.facilityCount} />
        <Stat label="Span" value={fmtSpan(stats.dateSpan.start, stats.dateSpan.end)} />
      </div>
      <div className="mt-2 text-[11px] text-slate-400">
        {fmtDate(stats.dateSpan.start)} → {fmtDate(stats.dateSpan.end)} ·{' '}
        <span className="text-sky-600">{stats.pdfBreakdown.real} live</span> /{' '}
        <span className="text-slate-400">{stats.pdfBreakdown.placeholder} placeholder</span> /{' '}
        {stats.pdfBreakdown.none} no-link PDFs
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Record types</div>
        <div className="space-y-1">
          {top.map((r) => (
            <div key={r.recordType} className="flex items-center gap-2">
              <div className="w-28 shrink-0 truncate text-xs text-slate-600" title={r.recordType}>
                {r.recordType}
              </div>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-accent-soft" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
              <div className="w-6 shrink-0 text-right text-xs font-medium text-slate-500">{r.count}</div>
            </div>
          ))}
        </div>
        {rest > 0 && <div className="mt-1 text-[11px] text-slate-400">+{rest} more record types</div>}
      </div>
    </Panel>
  );
}

function PrePostTable({
  comparison,
  tZeroDate,
  onPickTZeroPrompt,
}: {
  comparison: RegionComparison[];
  tZeroDate: Date | null;
  onPickTZeroPrompt: () => void;
}) {
  return (
    <Panel
      title="Pre / post T-Zero comparison"
      right={tZeroDate ? <span className="text-[11px] text-slate-400">anchor {fmtDateShort(tZeroDate)}</span> : null}
    >
      {!tZeroDate ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
          <p className="text-sm text-slate-500">
            Set a <span className="font-semibold text-accent">T-Zero anchor</span> (the incident date) to see, per
            body region, what is new versus pre-existing.
          </p>
          <button
            onClick={onPickTZeroPrompt}
            className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-deep"
          >
            Set T-Zero
          </button>
        </div>
      ) : comparison.length === 0 ? (
        <p className="text-sm italic text-slate-400">No coded body regions to compare.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="pb-1.5 font-semibold">Region</th>
                  <th className="pb-1.5 text-center font-semibold">Before</th>
                  <th className="pb-1.5 text-center font-semibold">After</th>
                  <th className="pb-1.5 font-semibold">First seen</th>
                  <th className="pb-1.5 font-semibold">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparison.map((c) => (
                  <tr key={c.partId} className="text-slate-700">
                    <td className="py-1.5 pr-2">
                      <span className="font-medium">{c.label}</span>
                      {c.laterality && <span className="ml-1 text-[10px] font-semibold text-accent">{c.laterality}</span>}
                    </td>
                    <td className="py-1.5 text-center tabular-nums text-slate-500">{c.before}</td>
                    <td className="py-1.5 text-center tabular-nums text-slate-500">{c.after}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-slate-500">{fmtDateShort(c.firstMention)}</td>
                    <td className="py-1.5">
                      <VerdictBadge verdict={c.verdict} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
            &ldquo;Before&rdquo; counts records dated prior to T-Zero; the incident-day encounter counts as post-incident. A
            pre-existing baseline is the defense&rsquo;s case — surface it rather than letting it ambush you.
          </p>
        </>
      )}
    </Panel>
  );
}

interface KeyEvent {
  row: ResolvedRow;
  label: string;
  category: ReturnType<typeof classify>;
}

function KeyEvents({ allRows, onOpenRow }: { allRows: ResolvedRow[]; onOpenRow: (r: ResolvedRow) => void }) {
  const events = useMemo<KeyEvent[]>(() => {
    const KEEP = new Set(['SURGERY', 'EMS', 'ER', 'DISCHARGE', 'IME', 'LEGAL', 'WORKSTATUS']);
    const out: KeyEvent[] = [];
    for (const row of allRows) {
      if (row.suppressed || !row.encounterDate) continue;
      const cat = classify(row.recordType);
      const isMmi = MMI_RE.test(row.summary ?? '');
      if (cat && KEEP.has(cat.category)) {
        out.push({ row, label: cat.category, category: cat });
      } else if (isMmi) {
        out.push({ row, label: 'MMI', category: null });
      }
    }
    return out.sort((a, b) => +(a.row.encounterDate ?? 0) - +(b.row.encounterDate ?? 0));
  }, [allRows]);

  return (
    <Panel title="Key events" right={<span className="text-[11px] text-slate-400">{events.length}</span>}>
      {events.length === 0 ? (
        <p className="text-sm italic text-slate-400">No surgeries, ER visits, IMEs, MMI, or work-status changes found.</p>
      ) : (
        <ol className="max-h-72 space-y-1 overflow-y-auto scroll-thin pr-1">
          {events.map((e, i) => (
            <li key={e.row.rowId + i}>
              <button
                onClick={() => onOpenRow(e.row)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
              >
                <span className="w-16 shrink-0 text-[11px] tabular-nums text-slate-400">
                  {fmtDateShort(e.row.encounterDate)}
                </span>
                {e.category ? (
                  <CategoryBadge category={e.category.category} />
                ) : (
                  <span className="inline-flex items-center rounded bg-[#F0EEFF] px-1.5 py-0.5 text-[11px] font-semibold uppercase text-accent ring-1 ring-inset ring-[#E3DCFB]">
                    MMI
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{e.row.recordType}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function UnassignedDrawer({
  noDate,
  noBody,
  onOpenRow,
}: {
  noDate: ResolvedRow[];
  noBody: ResolvedRow[];
  onOpenRow: (r: ResolvedRow) => void;
}) {
  const [open, setOpen] = useState<'none' | 'date' | 'body'>('none');
  const total = noDate.length + noBody.length;

  return (
    <Panel
      title="Unassigned data"
      right={
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{total}</span>
      }
    >
      {total === 0 ? (
        <p className="text-sm italic text-slate-400">Every record has a date and a coded body region.</p>
      ) : (
        <div className="space-y-2">
          <DrawerRow
            open={open === 'date'}
            onToggle={() => setOpen(open === 'date' ? 'none' : 'date')}
            label="No parseable date"
            hint="excluded from the timeline, not from the record set"
            count={noDate.length}
            rows={noDate}
            onOpenRow={onOpenRow}
          />
          <DrawerRow
            open={open === 'body'}
            onToggle={() => setOpen(open === 'body' ? 'none' : 'body')}
            label="No coded body region"
            hint="still on the timeline; simply no silhouette fill"
            count={noBody.length}
            rows={noBody}
            onOpenRow={onOpenRow}
          />
        </div>
      )}
    </Panel>
  );
}

function DrawerRow({
  open,
  onToggle,
  label,
  hint,
  count,
  rows,
  onOpenRow,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  hint: string;
  count: number;
  rows: ResolvedRow[];
  onOpenRow: (r: ResolvedRow) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200">
      <button
        onClick={onToggle}
        disabled={count === 0}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left disabled:opacity-50"
      >
        <div>
          <div className="text-xs font-semibold text-slate-700">{label}</div>
          <div className="text-[11px] text-slate-400">{hint}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{count}</span>
          {count > 0 && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`}
            >
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </button>
      {open && count > 0 && (
        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto scroll-thin border-t border-slate-100">
          {rows.map((r) => (
            <li key={r.rowId}>
              <button onClick={() => onOpenRow(r)} className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-slate-700">{r.recordType || '(untyped)'}</div>
                  <div className="truncate text-[11px] text-slate-400">{r.summary}</div>
                </div>
                <PdfBadge pdf={r.pdf} compact />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
