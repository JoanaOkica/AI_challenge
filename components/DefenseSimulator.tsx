'use client';

import { useMemo } from 'react';
import type { ResolvedView } from '@/lib/resolve';
import { buildCourtroom, type ArgStrength } from '@/lib/courtroom';

const STRENGTH: Record<ArgStrength, { bg: string; text: string; label: string }> = {
  strong: { bg: '#E4F5EA', text: '#1E7A45', label: 'STRONG GROUND' },
  even: { bg: '#FEF3E2', text: '#B0740F', label: 'CONTESTED' },
  uphill: { bg: '#EEF0F4', text: '#5A6272', label: 'CONCEDE CLEANLY' },
};

export default function DefenseSimulator({ view }: { view: ResolvedView }) {
  const analysis = useMemo(() => buildCourtroom(view.allRows, view.tZeroDate), [view]);
  const p = analysis.posture;

  const chips: { label: string; bg: string; text: string }[] = [
    ...(p.newRegions.length
      ? [{ label: `${p.newRegions.length} new ${p.newRegions.length === 1 ? 'injury' : 'injuries'}`, bg: 'rgba(226,59,59,0.22)', text: '#FFC9CC' }]
      : []),
    ...(p.aggravatedRegions.length
      ? [{ label: `${p.aggravatedRegions.length} aggravated`, bg: 'rgba(245,166,35,0.22)', text: '#FFD98A' }]
      : []),
    ...(p.preExistingRegions.length
      ? [{ label: `${p.preExistingRegions.length} pre-existing`, bg: 'rgba(255,255,255,0.14)', text: 'rgba(255,255,255,0.85)' }]
      : []),
    ...(p.surgeries ? [{ label: `${p.surgeries} ${p.surgeries === 1 ? 'surgery' : 'surgeries'}`, bg: 'rgba(91,229,154,0.18)', text: '#9BF0C4' }] : []),
    ...(p.gaps ? [{ label: `${p.gaps} record ${p.gaps === 1 ? 'gap' : 'gaps'}`, bg: 'rgba(255,255,255,0.14)', text: 'rgba(255,255,255,0.85)' }] : []),
  ];

  if (!view.tZeroDate) {
    return (
      <EmptyNote text="Set a T-Zero anchor on the Injury Dashboard to simulate the defense. Causation, aggravation, and gap arguments all pivot on the incident date." />
    );
  }

  return (
    <div className="mxfade flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Defense Simulator</h1>
        <span className="text-sm font-medium text-slate-500">
          Every argument this case will face — paired with a data-backed answer from the record.
        </span>
      </div>

      {/* posture banner */}
      <section className="rounded-2xl bg-gradient-to-br from-[#1B1730] via-[#2A2150] to-[#3A2B6B] p-6 text-white shadow-card sm:p-7">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold tracking-wide">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          CASE POSTURE
        </div>
        <h2 className="max-w-4xl text-xl font-extrabold leading-snug tracking-tight sm:text-2xl">
          {analysis.headline}
        </h2>
        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((c) => (
              <span
                key={c.label}
                className="rounded-full px-3 py-1.5 text-xs font-bold"
                style={{ background: c.bg, color: c.text }}
              >
                {c.label}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* argument cards */}
      <div className="flex flex-col gap-3.5">
        {analysis.args.map((a, i) => {
          const s = STRENGTH[a.strength];
          return (
            <section key={a.id} className="overflow-hidden rounded-2xl border border-[#ECECF1] bg-white shadow-card">
              <div className="flex items-center justify-between gap-3 border-b border-[#F1F1F5] px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-slate-300">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="truncate text-[15px] font-extrabold tracking-tight">{a.theme}</h3>
                </div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide"
                  style={{ background: s.bg, color: s.text }}
                >
                  {s.label}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <div className="border-b border-[#F1F1F5] bg-[#FCF8F8] px-5 py-4 sm:border-b-0 sm:border-r">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#C0555B]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M12 8v5m0 3h.01M12 3l9 16H3z" stroke="#C0555B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Defense will argue
                  </div>
                  <p className="text-[13px] leading-relaxed text-[#4A4550]">{a.defense}</p>
                </div>
                <div className="bg-[#F7F5FF] px-5 py-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-accent">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="#6A48D8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Your response
                  </div>
                  <p className="mb-2.5 text-[13px] leading-relaxed text-[#3B3550]">{a.response}</p>
                  {a.support.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {a.support.map((sup, j) => (
                        <span
                          key={j}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#E3DCFB] bg-white px-2 py-1 text-[10.5px] font-medium text-accent"
                        >
                          <svg width="10" height="12" viewBox="0 0 12 14" fill="none">
                            <path d="M2 1h5l3 3v9H2z" stroke="#6A48D8" strokeWidth="1.2" strokeLinejoin="round" />
                          </svg>
                          {sup.date} · {sup.recordType}
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
