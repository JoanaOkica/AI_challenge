'use client';

import { useMemo, useState } from 'react';
import type { ResolvedView } from '@/lib/resolve';
import type { AttorneyInputs, DemandResponse } from '@/lib/ai';
import { buildDemandRequest } from '@/lib/aiBuild';
import { fmtDateShort } from '@/lib/format';

interface Props {
  view: ResolvedView;
  attorney: AttorneyInputs;
  onAttorney: (a: AttorneyInputs) => void;
}

const FIELD =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-ink shadow-sm placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

export default function CaseBuilder({ view, attorney, onAttorney }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemandResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const encounterCount = view.visibleRows.length;
  const regionCount = view.comparison.length;

  const dateRange = useMemo(() => {
    const dated = view.visibleRows
      .map((r) => r.encounterDate)
      .filter((d): d is Date => !!d)
      .sort((a, b) => +a - +b);
    if (!dated.length) return '—';
    return `${fmtDateShort(dated[0])} → ${fmtDateShort(dated[dated.length - 1])}`;
  }, [view.visibleRows]);

  const patch = (p: Partial<AttorneyInputs>) => onAttorney({ ...attorney, ...p });

  async function draft() {
    setBusy(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const payload = buildDemandRequest(view, attorney);
      const res = await fetch('/api/demand-narrative', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
      setResult(data as DemandResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to draft the narrative.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mxfade flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Case Builder</h1>
        <span className="text-sm font-medium text-slate-500">
          The dashboard is the input. The demand letter is the output the firm bills against.
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ---------------- inputs ---------------- */}
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-[#ECECF1] bg-white p-5 shadow-card">
            <h2 className="mb-1 text-sm font-extrabold">Attorney inputs</h2>
            <p className="mb-4 text-[11.5px] text-slate-500">
              These frame the narrative. They are work product and never appear in the timeline exports.
            </p>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Client / plaintiff">
                  <input className={FIELD} value={attorney.clientName} onChange={(e) => patch({ clientName: e.target.value })} placeholder="Jane Delgado" />
                </Labeled>
                <Labeled label="Defendant">
                  <input className={FIELD} value={attorney.defendant} onChange={(e) => patch({ defendant: e.target.value })} placeholder="Ridgeline Freight" />
                </Labeled>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Incident date">
                  <input className={FIELD} value={attorney.incidentDate} onChange={(e) => patch({ incidentDate: e.target.value })} placeholder="01/15/2024" />
                </Labeled>
                <Labeled label="Jurisdiction">
                  <input className={FIELD} value={attorney.jurisdiction} onChange={(e) => patch({ jurisdiction: e.target.value })} placeholder="Cook County, IL" />
                </Labeled>
              </div>
              <Labeled label="How the incident happened">
                <textarea className={`${FIELD} min-h-[64px] resize-y`} value={attorney.incidentDescription} onChange={(e) => patch({ incidentDescription: e.target.value })} placeholder="Rear-end motor vehicle collision; client was the restrained driver…" />
              </Labeled>
              <Labeled label="Emphasis (liability theory, damages, tone)">
                <textarea className={`${FIELD} min-h-[64px] resize-y`} value={attorney.emphasis} onChange={(e) => patch({ emphasis: e.target.value })} placeholder="Stress the permanency of the cervical injury and the objective imaging." />
              </Labeled>
            </div>

            <button
              onClick={draft}
              disabled={busy || encounterCount === 0}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white shadow-[0_6px_18px_rgba(120,86,255,0.35)] transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Spinner /> Drafting…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="M13 6l4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Draft demand narrative
                </>
              )}
            </button>
            {encounterCount === 0 && (
              <p className="mt-2 text-center text-[11px] text-amber-600">
                No encounters in the current filter — widen filters on the dashboard first.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-[#ECECF1] bg-white p-5 shadow-card">
            <h2 className="mb-3 text-sm font-extrabold">What gets sent to Claude</h2>
            <div className="grid grid-cols-3 gap-2.5">
              <MiniStat value={String(encounterCount)} label="Encounters" />
              <MiniStat value={String(regionCount)} label="Regions" />
              <MiniStat value={view.tZeroDate ? fmtDateShort(view.tZeroDate) : '—'} label="T-Zero" />
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500">
              The filtered chronology — <span className="font-semibold text-ink">{dateRange}</span> — is sent with your
              inputs. Every sentence returned cites the encounter date it relies on.
            </p>
          </section>
        </div>

        {/* ---------------- output ---------------- */}
        <section className="min-h-[420px] rounded-2xl border border-[#ECECF1] bg-white p-6 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold">Demand letter — medical narrative</h2>
              {result && (
                <span className="rounded-full bg-[#F0EEFF] px-2 py-0.5 text-[10px] font-bold text-accent">
                  Claude · {result.model}
                </span>
              )}
            </div>
            {result && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(result.narrative);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
              {error}
            </div>
          )}

          {!error && !result && !busy && (
            <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F0EEFF]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M6 3h9l4 4v14H6z" stroke="#7856FF" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M9 12h7M9 15h7M9 9h3" stroke="#7856FF" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
              <p className="max-w-sm text-[13px] text-slate-500">
                Fill in the inputs and press <span className="font-semibold text-ink">Draft demand narrative</span>. The
                letter section appears here, each sentence tied to a produced record.
              </p>
            </div>
          )}

          {busy && (
            <div className="flex h-72 flex-col items-center justify-center gap-3 text-slate-500">
              <Spinner big />
              <p className="text-[13px]">Reading the chronology and writing the narrative…</p>
            </div>
          )}

          {result && (
            <>
              <article className="whitespace-pre-wrap text-[14px] leading-[1.7] text-[#2A2E3D]">
                {result.narrative}
              </article>
              <p className="mt-5 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
                Draft for attorney review. Every sentence should cite a produced encounter date — verify each against the
                record before sending. Demonstrative work product, not legal advice.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-[#F7F7FB] px-3 py-2.5">
      <div className="text-lg font-extrabold leading-none text-ink">{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function Spinner({ big = false }: { big?: boolean }) {
  const s = big ? 28 : 16;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
