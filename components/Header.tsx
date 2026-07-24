'use client';

import { useState } from 'react';
import type { CaseData, Granularity, ResolvedRow } from '@/lib/types';
import { GRANULARITY_LABELS, REGION_LABELS } from '@/lib/types';
import type { Filters } from '@/lib/resolve';
import type { Region } from '@/lib/bodyMap';
import { fmtDate, fmtDateISO } from '@/lib/format';
import Modal from './Modal';

const GRANULARITIES: Granularity[] = ['milestones', 'flagged', 'all'];

export interface HeaderProps {
  cases: CaseData[];
  activeCase: CaseData;
  onSwitchCase: (id: string) => void;
  onAddClick: () => void;
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

export default function Header(props: HeaderProps) {
  const {
    cases,
    activeCase,
    onSwitchCase,
    onAddClick,
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

  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [regionsOpen, setRegionsOpen] = useState(false);

  const patch = (p: Partial<Filters>) => onFilters({ ...filters, ...p });

  const toggleRegion = (r: Region) => {
    const next = new Set(filters.regions);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    patch({ regions: next });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      {/* Brand bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3 12h4l2 6 4-14 2 8h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold leading-tight text-slate-900">Medical Chronology &amp; Body Timeline</div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-amber-600">
              Demonstrative aids — not evidence · every element traces to a source record
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {tZeroRow ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs ring-1 ring-inset ring-indigo-200">
              <span className="font-semibold text-indigo-700">T-Zero</span>
              <span className="text-indigo-900">{fmtDate(tZeroRow.encounterDate)}</span>
              <button onClick={onClearTZero} className="ml-0.5 rounded text-indigo-400 hover:text-indigo-700" aria-label="Clear T-Zero">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={onTogglePickTZero}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
                pickingTZero
                  ? 'bg-indigo-600 text-white ring-indigo-600'
                  : 'bg-white text-indigo-700 ring-indigo-300 hover:bg-indigo-50'
              }`}
            >
              {pickingTZero ? 'Click a record to set T-Zero…' : 'Set T-Zero'}
            </button>
          )}
          <button
            onClick={onAddClick}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            + Add case
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2">
        {/* Case switcher */}
        <select
          value={activeCase.id}
          onChange={(e) => {
            const id = e.target.value;
            if (id !== activeCase.id) setPendingSwitch(id);
          }}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          title="Switch case"
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.stats.encounterCount})
            </option>
          ))}
        </select>

        {/* Granularity */}
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 shadow-sm">
          {GRANULARITIES.map((g) => (
            <button
              key={g}
              onClick={() => onGranularity(g)}
              className={`px-2.5 py-1.5 text-xs font-medium transition ${
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
            <svg width="10" height="10" viewBox="0 0 12 12" className="text-slate-400"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
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
                      <input type="checkbox" checked={checked} onChange={() => toggleRegion(r)} className="accent-indigo-600" />
                      <span>{REGION_LABELS[r]}</span>
                      {!present && <span className="ml-auto text-[10px] italic">none</span>}
                    </label>
                  );
                })}
                {filters.regions.size > 0 && (
                  <button
                    onClick={() => patch({ regions: new Set() })}
                    className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] font-medium text-accent hover:bg-indigo-50"
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

        {/* Search */}
        <div className="relative min-w-[180px] flex-1">
          <svg width="14" height="14" viewBox="0 0 16 16" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder="Search summary, provider, facility…"
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-xs text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {(filters.search || filters.regions.size > 0 || filters.from || filters.to) && (
          <button
            onClick={() => onFilters({ search: '', regions: new Set(), from: null, to: null })}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            Reset filters
          </button>
        )}
      </div>

      <Modal
        open={pendingSwitch != null}
        onClose={() => setPendingSwitch(null)}
        title="Switch case?"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingSwitch(null)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (pendingSwitch) onSwitchCase(pendingSwitch);
                setPendingSwitch(null);
              }}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Switch case
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          You are viewing <span className="font-semibold text-slate-800">{activeCase.name}</span>. Switching loads a
          different chronology. Your attorney notes are saved per case and will be waiting when you return.
        </p>
      </Modal>
    </header>
  );
}
