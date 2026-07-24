'use client';

import { useState } from 'react';
import type { ResolvedRow } from '@/lib/types';
import { fmtDateShort } from '@/lib/format';
import { partLabel } from '@/lib/labels';
import { PdfBadge } from './ui';

interface DataTableProps {
  rows: ResolvedRow[];
  suppressedRows: ResolvedRow[];
  onOpenRow: (row: ResolvedRow) => void;
  onToggleSuppress: (rowId: string) => void;
}

export default function DataTable({ rows, suppressedRows, onOpenRow, onToggleSuppress }: DataTableProps) {
  const [showSuppressed, setShowSuppressed] = useState(false);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-800">Records</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">
                  No records match the current view.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.rowId}
                onClick={() => onOpenRow(r)}
                className="cursor-pointer hover:bg-indigo-50/40"
              >
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">
                  {fmtDateShort(r.encounterDate)}
                  {r.starred && <span className="ml-1 text-amber-500" title="Marked as milestone">★</span>}
                  {r.isTZero && <span className="ml-1 font-semibold text-indigo-600" title="T-Zero anchor">◆</span>}
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
