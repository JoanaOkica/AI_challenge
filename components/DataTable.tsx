'use client';

import { useMemo, useState } from 'react';
import type { ResolvedRow } from '@/lib/types';
import { fmtDateShort } from '@/lib/format';
import { partLabel } from '@/lib/labels';
import { classify } from '@/lib/milestones';
import { PdfBadge } from './ui';

interface DataTableProps {
  rows: ResolvedRow[];
  suppressedRows: ResolvedRow[];
  onOpenRow: (row: ResolvedRow) => void;
  onToggleSuppress: (rowId: string) => void;
}

const SELECT =
  'rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

export default function DataTable({ rows, suppressedRows, onOpenRow, onToggleSuppress }: DataTableProps) {
  const [showSuppressed, setShowSuppressed] = useState(false);

  // Records-local filters — the toolbar above still scopes the timeline.
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [spec, setSpec] = useState('');
  const [year, setYear] = useState('');

  const categories = useMemo(
    () => [...new Set(rows.map((r) => classify(r.recordType)?.category).filter(Boolean))].sort() as string[],
    [rows],
  );
  const specialties = useMemo(
    () => [...new Set(rows.map((r) => r.medicineType?.trim()).filter(Boolean))].sort() as string[],
    [rows],
  );
  const years = useMemo(
    () =>
      [...new Set(rows.map((r) => r.encounterDate?.getFullYear()).filter(Boolean))]
        .sort()
        .map(String) as string[],
    [rows],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle) {
        const hay = `${r.summary}\n${r.provider}\n${r.facility}\n${r.recordType}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (cat && classify(r.recordType)?.category !== cat) return false;
      if (spec && r.medicineType?.trim() !== spec) return false;
      if (year && String(r.encounterDate?.getFullYear() ?? '') !== year) return false;
      return true;
    });
  }, [rows, q, cat, spec, year]);

  const dirty = !!(q || cat || spec || year);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-[#2a2d3d] dark:bg-[#1a1d27]">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-[#2a2d3d]">
        <h2 className="text-sm font-semibold text-slate-800">Records</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
          {dirty ? `${shown.length} of ${rows.length}` : `${rows.length} row${rows.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Filter bar — lives with the records it filters, not in the app header. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-[#2a2d3d]">
        <div className="relative min-w-[220px] flex-1">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search summary, provider, facility, record type…"
            aria-label="Search records"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={SELECT} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={spec} onChange={(e) => setSpec(e.target.value)} className={SELECT} aria-label="Specialty">
          <option value="">All specialties</option>
          {specialties.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} className={SELECT} aria-label="Date">
          <option value="">All dates</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setQ('');
            setCat('');
            setSpec('');
            setYear('');
          }}
          disabled={!dirty}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-semibold">Date</th>
              <th className="px-3 py-2 font-semibold">Record type</th>
              <th className="px-3 py-2 font-semibold">Provider / facility</th>
              <th className="px-3 py-2 font-semibold">Body regions</th>
              <th className="px-3 py-2 font-semibold">Summary</th>
              <th className="px-3 py-2 font-semibold">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">
                  No records match the current filters.
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr
                key={r.rowId}
                onClick={() => onOpenRow(r)}
                className="cursor-pointer hover:bg-[#F7F5FF]"
              >
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">
                  {fmtDateShort(r.encounterDate)}
                  {r.starred && <span className="ml-1 text-amber-500" title="Marked as milestone">★</span>}
                  {r.isTZero && <span className="ml-1 font-semibold text-accent" title="T-Zero anchor">◆</span>}
                </td>
                <td className="px-3 py-2 font-medium text-slate-700">{r.recordType || '—'}</td>
                <td className="px-3 py-2 text-slate-500">
                  <div className="max-w-[180px] truncate">{r.provider || '—'}</div>
                  <div className="max-w-[180px] truncate text-[11px] text-slate-400">{r.facility}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex max-w-[180px] flex-wrap gap-1">
                    {r.bodyParts.slice(0, 3).map((p, i) => (
                      <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {partLabel(p.id)}
                        {p.laterality ? ` ${p.laterality[0].toUpperCase()}` : ''}
                      </span>
                    ))}
                    {r.bodyParts.length > 3 && (
                      <span className="text-[10px] text-slate-400">+{r.bodyParts.length - 3}</span>
                    )}
                    {r.bodyParts.length === 0 && <span className="text-[10px] italic text-slate-300">none</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-600">
                  <div className="max-w-[340px] truncate">{r.summary}</div>
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <PdfBadge pdf={r.pdf} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {suppressedRows.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2">
          <button
            onClick={() => setShowSuppressed((v) => !v)}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
          >
            {showSuppressed ? 'Hide' : 'Show'} {suppressedRows.length} suppressed row{suppressedRows.length === 1 ? '' : 's'}
          </button>
          {showSuppressed && (
            <ul className="mt-2 space-y-1">
              {suppressedRows.map((r) => (
                <li key={r.rowId} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-50">
                  <span className="w-16 shrink-0 tabular-nums">{fmtDateShort(r.encounterDate)}</span>
                  <span className="min-w-0 flex-1 truncate line-through">{r.recordType} · {r.summary}</span>
                  <button
                    onClick={() => onToggleSuppress(r.rowId)}
                    className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 font-medium text-slate-600 hover:bg-white"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
