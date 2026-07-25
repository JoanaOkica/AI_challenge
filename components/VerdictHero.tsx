'use client';

import { useMemo } from 'react';
import type { CaseData } from '@/lib/types';
import type { ResolvedView } from '@/lib/resolve';
import { buildCourtroom } from '@/lib/courtroom';

/**
 * The "read this in 20 seconds" verdict block at the top of the dashboard:
 * the case's posture in one sentence, the headline chips, and the key counts.
 * Deliberately dark in both themes — it's the cover of the exhibit.
 */
export default function VerdictHero({ caseData, view }: { caseData: CaseData; view: ResolvedView }) {
  const courtroom = useMemo(
    () => buildCourtroom(caseData.rows, view.tZeroDate),
    [caseData, view.tZeroDate],
  );
  const p = courtroom.posture;
  const s = caseData.stats;
  const start = s.dateSpan.start;
  const end = s.dateSpan.end;
  const spanShort =
    start && end ? `'${String(start.getFullYear()).slice(2)}–'${String(end.getFullYear()).slice(2)}` : '—';

  const chips: { n: number; label: string; fg: string; bg: string }[] = [
    { n: p.newRegions.length, label: p.newRegions.length === 1 ? 'new injury' : 'new injuries', fg: '#ffb3ac', bg: 'rgba(217,45,45,0.32)' },
    { n: p.aggravatedRegions.length, label: 'aggravated', fg: '#ffd479', bg: 'rgba(199,122,0,0.30)' },
    { n: p.preExistingRegions.length, label: 'pre-existing', fg: '#cfd4e2', bg: 'rgba(255,255,255,0.10)' },
    { n: p.surgeries, label: p.surgeries === 1 ? 'surgery' : 'surgeries', fg: '#bcd0ff', bg: 'rgba(120,86,255,0.30)' },
    { n: p.gaps, label: p.gaps === 1 ? 'record gap' : 'record gaps', fg: '#cfd4e2', bg: 'rgba(255,255,255,0.10)' },
  ].filter((c) => c.n > 0);

  const tiles: [string | number, string][] = [
    [s.encounterCount, 'Encounters'],
    [view.nodes.length, 'Milestones'],
    [s.providerCount, 'Providers'],
    [spanShort, 'Date span'],
  ];

  return (
    <section
      className="flex flex-wrap justify-between gap-6 rounded-2xl px-6 py-5 shadow-card"
      style={{ background: 'linear-gradient(135deg,#2a2340,#20263c)' }}
    >
      <div className="min-w-[280px] flex-1 basis-[420px]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1 text-[11px] font-bold text-[#ece8f7]">
          <span className="h-[7px] w-[7px] rounded-full bg-[#3ddc84]" /> Read this in 20 seconds
        </span>
        <h2 className="my-3 max-w-[640px] text-[26px] font-extrabold leading-[1.18] tracking-[-0.015em] text-white">
          {courtroom.headline}
        </h2>
        <div className="flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <span key={i} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: c.fg, background: c.bg }}>
              {c.n} {c.label}
            </span>
          ))}
        </div>
      </div>
      <div className="grid basis-[340px] grid-cols-2 content-start gap-2.5">
        {tiles.map(([n, l], i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/[0.07] px-4 py-2.5">
            <div className="text-[21px] font-extrabold tracking-[-0.02em] text-white tabular-nums">{n}</div>
            <div className="mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.13em] text-[#a99fc9]">{l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
