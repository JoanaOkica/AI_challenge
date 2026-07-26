'use client';

import { useMemo, useState } from 'react';
import type { ResolvedView } from '@/lib/resolve';
import { buildCourtroom, type ArgStrength } from '@/lib/courtroom';
import { downloadComparison } from '@/lib/export/comparison';
import { fmtDateShort } from '@/lib/format';

/**
 * Strength reads from the plaintiff's side of the table, because that is the
 * decision the lawyer is making: press it, prepare for a fight, or give it up.
 */
const STRENGTH: Record<ArgStrength, { bg: string; text: string; label: string }> = {
  strong: { bg: '#E9F5EF', text: '#1F8A5B', label: 'FAVORS YOU' },
  even: { bg: '#FDF3E2', text: '#B0740F', label: 'CONTESTED' },
  uphill: { bg: '#FBECEB', text: '#C0392B', label: 'CONCEDE / UPHILL' },
};

export default function DefenseSimulator({
  view,
  caseName,
}: {
  view: ResolvedView;
  caseName: string;
}) {
  const analysis = useMemo(() => buildCourtroom(view.allRows, view.tZeroDate), [view]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = analysis.posture;

  if (!view.tZeroDate) {
    return (
      <EmptyNote text="Set a T-Zero anchor on the Injury Dashboard to simulate the defense. Causation, aggravation, and gap arguments all pivot on the incident date." />
    );
  }

  /** Exposure split — how much of the case is new versus already conceded. */
  const segments = [
    { n: p.newRegions.length, label: 'New', color: '#C0392B' },
    { n: p.aggravatedRegions.length, label: 'Aggravated', color: '#C77A00' },
    { n: p.preExistingRegions.length, label: 'Pre-existing', color: '#8A95A7' },
  ];
  const total = Math.max(1, segments.reduce((sum, s) => sum + s.n, 0));

  const counts: [string | number, string][] = [
    [p.surgeries, 'Surgeries'],
    [p.imaging, 'Imaging'],
    [p.imes, 'IMEs'],
    [p.gaps, 'Gaps'],
    [p.mmi ? 'Yes' : 'No', 'MMI'],
  ];

  async function exportFile() {
    setBusy(true);
    setError(null);
    try {
      await downloadComparison(
        analysis,
        caseName,
        view.tZeroDate ? fmtDateShort(view.tZeroDate) : null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mxfade flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Defense Simulator</h1>
        <span className="text-sm font-medium text-slate-500">
          Every argument this case will face — paired with a data-backed answer from the record.
        </span>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-[15px] font-extrabold tracking-tight">
            Courtroom challenge — what the defense will argue, and your answer
          </h2>
          <button
            onClick={exportFile}
            disabled={busy}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-[0_6px_18px_rgba(120,86,255,0.35)] transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {busy ? 'Rendering…' : 'Generate comparison file'}
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start gap-5">
            <div className="min-w-[260px] flex-1">
              <div className="flex h-[22px] overflow-hidden rounded-md border border-slate-200">
                {segments
                  .filter((s) => s.n > 0)
                  .map((s) => (
                    <div
                      key={s.label}
                      title={s.label}
                      className="grid place-items-center text-[10px] font-extrabold text-white"
                      style={{ width: `${(s.n / total) * 100}%`, background: s.color }}
                    >
                      {s.n}
                    </div>
                  ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3.5 text-[11px] text-slate-600">
                {segments.map((s) => (
                  <span key={s.label} className="inline-flex items-center gap-1.5">
                    <i
                      className="inline-block h-[9px] w-[9px] rounded-sm"
                      style={{ background: s.color }}
                    />
                    {s.label} · {s.n}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {counts.map(([n, label]) => (
                <div
                  key={label}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-center shadow-card"
                >
                  <div className="text-lg font-extrabold tracking-tight tabular-nums">{n}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-3.5 text-[13.5px] font-medium leading-relaxed text-ink">
            {analysis.headline}
          </p>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</p>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {analysis.args.map((a) => {
          const s = STRENGTH[a.strength];
          return (
            <section
              key={a.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card"
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <h3 className="truncate text-[13px] font-extrabold tracking-tight">{a.theme}</h3>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[9.5px] font-extrabold tracking-wider"
                  style={{ background: s.bg, color: s.text }}
                >
                  {s.label}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2">
                <div className="border-b border-slate-100 px-4 py-3.5 sm:border-b-0 sm:border-r">
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-[#C0392B]">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#C0392B]" />
                    Defense will argue
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-slate-700">{a.defense}</p>
                </div>

                <div className="px-4 py-3.5">
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-[#1F8A5B]">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#1F8A5B]" />
                    Your data-backed response
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-slate-700">{a.response}</p>
                  {a.support.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {a.support.map((sup, j) => (
                        <span
                          key={j}
                          className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
                        >
                          {sup.date} · {sup.recordType}
                          {sup.bates ? ` · ${sup.bates}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="mxfade flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Defense Simulator</h1>
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 shadow-card">
        {text}
      </div>
    </div>
  );
}
