'use client';

import { useState } from 'react';
import type { Granularity, ResolvedRow } from '@/lib/types';
import { GRANULARITY_LABELS, REGION_LABELS } from '@/lib/types';
import type { Filters } from '@/lib/resolve';
import type { Region } from '@/lib/bodyMap';
import { fmtDate, fmtDateISO } from '@/lib/format';

const GRANULARITIES: Granularity[] = ['milestones', 'flagged', 'all'];

export interface DashboardToolbarProps {
  granularity: Granularity;
  onGranularity: (g: Granularity) => void;
  filters: Filters;
  onFilters: (f: Filters) => void;
  regionsPresent: Region[];
  tZeroRow: ResolvedRow | null;
  pickingTZero: boolean;
  onTogglePickTZero: () => void;
  onClearTZero: () => void;
}

export default function Header(props: DashboardToolbarProps) {
  const {
    granularity,
    onGranularity,
    filters,
    onFilters,
    regionsPresent,
    tZeroRow,
    pickingTZero,
    onTogglePickTZero,
    onClearTZero,
  } = props;

  const [regionsOpen, setRegionsOpen] = useState(false);
  const patch = (p: Partial<Filters>) => onFilters({ ...filters, ...p });

  const toggleRegion = (r: Region) => {
    const next = new Set(filters.regions);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    patch({ regions: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#ECECF1] bg-white px-3 py-2.5 shadow-card dark:border-[#2a2d3d] dark:bg-[#1a1d27]">
      {/* Granularity */}
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 shadow-sm">
        {GRANULARITIES.map((g) => (
          <button
            key={g}
            onClick={() => onGranularity(g)}
            className={`px-2.5 py-1.5 text-xs font-semibold transition ${
              granularity === g ? 'bg-accent text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {GRANULARITY_LABELS[g]}
          </button>
        ))}
      </div>

      {/* Region multi-select */}
      <div className="relative">
        <button
          onClick={() => setRegionsOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Regions
          {filters.regions.size > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {filters.regions.size}
            </span>
          )}
          <svg width="10" height="10" viewBox="0 0 12 12" className="text-slate-400">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        {regionsOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setRegionsOpen(false)} aria-hidden />
            <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
              {(Object.keys(REGION_LABELS) as Region[]).map((r) => {
                const present = regionsPresent.includes(r);
                const checked = filters.regions.has(r);
                return (
                  <label
                    key={r}
                    className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50 ${
                      present ? 'text-slate-700' : 'text-slate-400'
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleRegion(r)} className="accent-[#7856FF]" />
                    <span>{REGION_LABELS[r]}</span>
                    {!present && <span className="ml-auto text-[10px] italic">none</span>}
                  </label>
                );
              })}
              {filters.regions.size > 0 && (
                <button
                  onClick={() => patch({ regions: new Set() })}
                  className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] font-medium text-accent hover:bg-[#F0EEFF]"
                >
                  Clear regions
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Date range */}
      <div className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm">
        <input
          type="date"
          value={fmtDateISO(filters.from)}
          onChange={(e) => patch({ from: e.target.value ? new Date(e.target.value + 'T00:00:00') : null })}
          className="bg-transparent text-slate-600 focus:outline-none"
          aria-label="From date"
        />
        <span className="text-slate-300">–</span>
        <input
          type="date"
          value={fmtDateISO(filters.to)}
          onChange={(e) => patch({ to: e.target.value ? new Date(e.target.value + 'T00:00:00') : null })}
          className="bg-transparent text-slate-600 focus:outline-none"
          aria-label="To date"
        />
      </div>

      {(filters.regions.size > 0 || filters.from || filters.to) && (
        <button
          onClick={() => onFilters({ ...filters, regions: new Set(), from: null, to: null })}
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          Reset
        </button>
      )}

      <div className="ml-auto">
        {tZeroRow ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-[#F0EEFF] px-2.5 py-1.5 text-xs ring-1 ring-inset ring-[#E3DCFB]">
            <span className="font-semibold text-accent">T-Zero</span>
            <span className="text-ink">{fmtDate(tZeroRow.encounterDate)}</span>
            <button onClick={onClearTZero} className="ml-0.5 rounded text-accent/60 hover:text-accent" aria-label="Clear T-Zero">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={onTogglePickTZero}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
              pickingTZero ? 'bg-accent text-white ring-accent' : 'bg-white text-accent ring-[#E3DCFB] hover:bg-[#F0EEFF]'
            }`}
          >
            {pickingTZero ? 'Click a record to set T-Zero…' : 'Set T-Zero'}
          </button>
        )}
      </div>
    </div>
  );
}
