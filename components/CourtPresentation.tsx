'use client';

import { useState } from 'react';
import type { CaseData } from '@/lib/types';
import type { ResolvedView } from '@/lib/resolve';
import type {
  AttorneyInputs,
  PresentationResponse,
  Slide,
  CaseShape,
} from '@/lib/ai';
import { SHAPE_LABELS, SHAPE_BLURB } from '@/lib/ai';
import type { GlossaryEntry } from '@/lib/ai';
import { downloadPdf, downloadPptx } from '@/lib/export/deck';
import { buildPresentationInput } from '@/lib/aiBuild';
import { AccessRequiredError, postJson } from '@/lib/apiClient';
import AccessCodePrompt from './AccessCodePrompt';
import { VerdictBadge } from './ui';
import type { CausationVerdict } from '@/lib/types';

interface Props {
  caseData: CaseData;
  view: ResolvedView;
  attorney: AttorneyInputs;
}

export default function CourtPresentation({ caseData, view, attorney }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PresentationResponse | null>(null);
  const [needsCode, setNeedsCode] = useState<string | null>(null);

  const canBuild = !!view.tZeroDate && view.comparison.length > 0;

  async function build() {
    setBusy(true);
    setError(null);
    setResult(null);
    setNeedsCode(null);
    try {
      const payload = buildPresentationInput(caseData, view, attorney);
      setResult(await postJson<PresentationResponse>('/api/court-presentation', payload));
    } catch (e) {
      if (e instanceof AccessRequiredError) setNeedsCode(e.message);
      else setError(e instanceof Error ? e.message : 'Failed to build the presentation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mxfade flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">Court Presentation</h1>
          <span className="text-sm font-medium text-slate-500">
            The model picks the case&rsquo;s shape, then writes plain jury captions. The slides render from the record.
          </span>
        </div>
        <button
          onClick={build}
          disabled={busy || !canBuild}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-[0_6px_18px_rgba(120,86,255,0.35)] transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <>
              <Spinner /> Building…
            </>
          ) : result ? (
            'Rebuild presentation'
          ) : (
            'Build presentation'
          )}
        </button>
      </div>

      {!canBuild && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 shadow-card">
          Set a T-Zero anchor on the Injury Dashboard so the pre/post comparison exists — the slide data is built from it.
        </div>
      )}

      {needsCode && <AccessCodePrompt message={needsCode} onSubmit={build} />}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</div>
      )}

      {busy && (
        <div className="flex h-80 flex-col items-center justify-center gap-3 rounded-2xl border border-[#ECECF1] bg-white text-slate-500 shadow-card">
          <Spinner big />
          <p className="text-[13px]">Classifying the case shape, then writing captions at a 12-year-old reading level…</p>
        </div>
      )}

      {result && (
        <>
          <ShapeBanner shape={result.shape} rationale={result.rationale} />

          <section className="overflow-hidden rounded-2xl border border-[#ECECF1] bg-white shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F1F5] px-6 py-4 print:hidden">
              <h2 className="text-[15px] font-extrabold">Jury slides</h2>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-amber-700">
                  Captions pre-generated · numbers from the record
                </span>
                <button
                  onClick={() => downloadPdf()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[13px] font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M6 9V3h12v6M6 18h12v3H6zM6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  </svg>
                  Download PDF
                </button>
                <button
                  onClick={() => {
                    void downloadPptx(result, {
                      caseName: caseData.name.replace(/^SAMPLE\s*—\s*/i, ''),
                      incidentDate: attorney.incidentDate,
                    });
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1E2547] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#2A3260]"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M3 4h18v11H3zM12 15v4m-4 0h8" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  </svg>
                  Download PowerPoint
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-5 bg-[#FAFAFC] p-5 print:bg-white print:p-0">
              {result.slides.map((s, i) => (
                <SlideCard
                  key={s.id}
                  slide={s}
                  index={i}
                  total={result.slides.length}
                  caseName={caseData.name.replace(/^SAMPLE\s*—\s*/i, '')}
                />
              ))}
            </div>
          </section>

          <p className="px-1 text-[11px] text-slate-400">
            Demonstrative aid for trial. Every figure traces to a produced record; captions and plain-English notes are
            AI-drafted and must be attorney-approved before display to a jury.
          </p>
        </>
      )}
    </div>
  );
}

function ShapeBanner({ shape, rationale }: { shape: CaseShape; rationale: string }) {
  return (
    <section className="rounded-2xl bg-gradient-to-r from-[#4B4499] to-[#6E68C4] px-7 py-6 text-white shadow-card print:hidden">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">Story shape selected</div>
      <div className="mt-1 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px] md:items-start">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">{SHAPE_LABELS[shape]}</h2>
          <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-white/90">{rationale}</p>
        </div>
        <p className="text-[13px] leading-relaxed text-white/80">{SHAPE_BLURB[shape]}</p>
      </div>
    </section>
  );
}

function SlideCard({
  slide,
  index,
  total,
  caseName,
}: {
  slide: Slide;
  index: number;
  total: number;
  caseName: string;
}) {
  const isTitle = slide.template === 'title';
  return (
    <section className="slide-card overflow-hidden rounded-xl border border-[#E7E8EE] bg-white">
      <div className="flex items-center justify-between border-b border-[#F1F1F5] bg-[#FBFBFD] px-6 py-3">
        <span className="text-[12.5px] font-bold text-ink">{caseName}</span>
        <span className="font-mono text-[11.5px] text-slate-400">
          Slide {index + 1} / {total}
        </span>
      </div>

      <div className={`px-8 ${isTitle ? 'py-12 text-center' : 'py-8'}`}>
        {!isTitle && <h3 className="mb-6 text-xl font-extrabold tracking-tight text-ink">{slide.heading}</h3>}
        {isTitle && <h3 className="mb-4 text-3xl font-extrabold tracking-tight text-ink">{slide.heading}</h3>}
        <SlideBody slide={slide} />
      </div>

      {(slide.caption || slide.plain) && (
        <div className="border-t border-dashed border-[#E7E8EE] px-8 py-4">
          {slide.caption && (
            <>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-accent">Jury caption</div>
              <p className="text-[15px] font-semibold leading-snug text-[#2A2E3D]">{slide.caption}</p>
            </>
          )}
          {slide.plain && (
            <p className="mt-2.5 border-l-2 border-accent/30 pl-3 text-[12.5px] leading-relaxed text-slate-500">
              <span className="font-bold text-slate-600">In plain English: </span>
              {slide.plain}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Per-template renderers — deterministic, from real record data.      *
 * ------------------------------------------------------------------ */

function SlideBody({ slide }: { slide: Slide }) {
  const d = slide.data as Record<string, unknown>;
  switch (slide.template) {
    case 'title': {
      const data = d as { subtitle?: string; incidentDate?: string };
      return (
        <div className="rounded-xl bg-gradient-to-br from-[#F7F5FF] to-[#EFEAFF] px-6 py-10 text-center">
          <p className="mx-auto max-w-2xl text-lg font-semibold leading-snug text-[#2A2E3D]">{data.subtitle}</p>
          {data.incidentDate && (
            <p className="mt-4 inline-block rounded-full bg-white px-4 py-1.5 text-xs font-bold text-accent shadow-sm">
              Day of the crash · {data.incidentDate}
            </p>
          )}
        </div>
      );
    }
    case 'stat_compare': {
      const rows = ((d.rows as { label: string; before: number; after: number; verdict: CausationVerdict }[]) || []);
      const max = Math.max(1, ...rows.map((r) => Math.max(r.before, r.after)));
      return (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <div className="w-40 shrink-0 text-[13px] font-semibold text-ink">{r.label}</div>
              <div className="flex flex-1 items-center gap-3">
                <Bar value={r.before} max={max} color="#94A3B8" caption="before" />
                <Bar value={r.after} max={max} color="#7856FF" caption="after" />
              </div>
              <VerdictBadge verdict={r.verdict} />
            </div>
          ))}
        </div>
      );
    }
    case 'region_grid': {
      const regions = ((d.regions as { label: string; verdict: CausationVerdict; firstMention: string }[]) || []);
      return (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {regions.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 rounded-xl border border-[#F0F0F4] bg-[#FAFAFC] px-4 py-3">
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-ink">{r.label}</div>
                <div className="font-mono text-[11px] text-slate-400">first seen {r.firstMention}</div>
              </div>
              <VerdictBadge verdict={r.verdict} />
            </div>
          ))}
        </div>
      );
    }
    case 'timeline': {
      const events = ((d.events as { date: string; label: string; note: string }[]) || []);
      return (
        <div className="flex flex-col">
          {events.map((e, i) => (
            <div key={i} className="grid grid-cols-[72px_20px_minmax(0,1fr)] items-start">
              <div className="pt-1 text-right font-mono text-[11.5px] text-slate-500">{e.date}</div>
              <div className="flex flex-col items-center self-stretch">
                <div className="mt-1.5 h-3 w-3 rounded-full bg-accent ring-2 ring-white" style={{ boxShadow: '0 0 0 1.5px #7856FF' }} />
                {i < events.length - 1 && <div className="w-0 flex-1 border-l-2 border-dotted border-slate-300" />}
              </div>
              <div className="pb-4 pl-2">
                <span className="mr-2 inline-block rounded bg-[#F0EEFF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                  {e.label}
                </span>
                <span className="text-[13px] text-[#5A6070]">{e.note}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'stat_row': {
      const kpis = ((d.kpis as { value: string; label: string }[]) || []);
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl bg-[#F7F7FB] px-4 py-4 text-center">
              <div className="text-3xl font-extrabold leading-none text-accent">{k.value}</div>
              <div className="mt-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{k.label}</div>
            </div>
          ))}
        </div>
      );
    }
    case 'quote_records': {
      const records = ((d.records as { date: string; label: string; note: string }[]) || []);
      return (
        <div className="flex flex-col gap-2.5">
          {records.map((r, i) => (
            <div key={i} className="rounded-xl border border-[#F0F0F4] bg-[#FAFAFC] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold text-slate-500">{r.date}</span>
                <span className="text-[13px] font-bold text-ink">{r.label}</span>
              </div>
              {r.note && <p className="mt-1 text-[12.5px] leading-relaxed text-[#5A6070]">{r.note}</p>}
            </div>
          ))}
        </div>
      );
    }
    case 'body_diagram': {
      const regions = ((d.regions as { label: string; after: number; verdict: CausationVerdict }[]) || []);
      return <BodyDiagramSlide regions={regions} />;
    }
    case 'glossary': {
      const entries = ((d.entries as GlossaryEntry[]) || []);
      if (!entries.length) {
        return (
          <p className="text-[13px] italic text-slate-400">
            No medical terms needed explaining on this deck.
          </p>
        );
      }
      return (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {entries.map((g) => (
            <div key={g.term} className="rounded-xl border border-[#F0F0F4] bg-[#FAFAFC] px-4 py-3">
              <dt className="text-[13.5px] font-extrabold text-ink">{g.term}</dt>
              <dd className="mt-1 text-[12.5px] leading-relaxed text-[#5A6070]">{g.plain}</dd>
            </div>
          ))}
        </dl>
      );
    }
    default:
      return null;
  }
}

/**
 * A schematic figure keyed to the region data — deliberately a chart, not a
 * depiction. Nothing here is generated imagery: an invented picture of an
 * injury would be a fabrication in an exhibit that is supposed to trace to the
 * record. Each hurt region is shaded by how much treatment it drew.
 */
function BodyDiagramSlide({
  regions,
}: {
  regions: { label: string; after: number; verdict: CausationVerdict }[];
}) {
  const max = Math.max(1, ...regions.map((r) => r.after));
  const zones = new Map<string, number>();

  for (const r of regions) {
    const l = r.label.toLowerCase();
    // Laterality is load-bearing: shading a healthy right knee because the left
    // one was hurt would misstate the injury on an exhibit shown to a jury.
    const left = /\bleft\b/.test(l);
    const right = /\bright\b/.test(l);
    const sides = left && !right ? ['L'] : right && !left ? ['R'] : ['L', 'R'];
    const put = (k: string) => zones.set(k, Math.max(zones.get(k) ?? 0, r.after));
    const putSided = (k: string) => sides.forEach((sd) => put(k + sd));

    if (/neck|cervical/.test(l)) put('neck');
    else if (/head|brain|face|eye|ear|nose|mouth|scalp/.test(l)) put('head');
    else if (/knee/.test(l)) putSided('knee');
    else if (/ankle|foot/.test(l)) putSided('foot');
    else if (/hip|pelvis|thigh/.test(l)) putSided('thigh');
    else if (/shoulder|arm|elbow|wrist|hand/.test(l)) putSided('arm');
    else if (/leg|shin|calf/.test(l)) putSided('leg');
    else if (/lumbar|thoracic|spine|back|abdomen|stomach/.test(l)) put('torsoLower');
    else if (/chest|rib|cardio|respirat|lung/.test(l)) put('torsoUpper');
  }

  const fill = (k: string) => {
    const n = zones.get(k);
    if (!n) return '#E4E1F1';
    const t = n / max;
    return t > 0.66 ? '#D8332B' : t > 0.33 ? '#E1584F' : '#F2AFA6';
  };

  return (
    <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
      <svg viewBox="-6 0 132 352" className="mx-auto h-[260px]">
        <ellipse cx="60" cy="30" rx="18" ry="22" fill={fill('head')} />
        <path d="M52 46 L68 46 L69 60 C69 63 66 64 60 64 C54 64 51 63 51 60 Z" fill={fill('neck')} />
        <path d="M60 61 C71 61 80 64 86 69 C91 74 93 81 93 89 L91 118 C90 132 87 143 84 151 L36 151 C33 143 30 132 29 118 L27 89 C27 81 29 74 34 69 C40 64 49 61 60 61 Z" fill={fill('torsoUpper')} />
        <path d="M36 151 L84 151 C83 163 82 173 81 181 C80 191 77 198 71 201 L49 201 C43 198 40 191 39 181 C38 173 37 163 36 151 Z" fill={fill('torsoLower')} />
        <path d="M33 67 C25 70 20 79 18 93 L14 148 C13 166 12 184 12 197 C12 202 14 205 18 205 L23 205 C26 205 28 202 28 197 C28 184 28 167 29 150 L33 97 C34 86 36 77 39 70 Z" fill={fill('arm')} />
        <path d="M87 67 C95 70 100 79 102 93 L106 148 C107 166 108 184 108 197 C108 202 106 205 102 205 L97 205 C94 205 92 202 92 197 C92 184 92 167 91 150 L87 97 C86 86 84 77 81 70 Z" fill={fill('armL')} />
        <path d="M39 201 L58 201 L58 232 C58 246 57 258 56 268 L41 268 C39 258 37 246 36 232 C35 220 36 209 39 201 Z" fill={fill('thighR')} />
        <path d="M81 201 L62 201 L62 232 C62 246 63 258 64 268 L79 268 C81 258 83 246 84 232 C85 220 84 209 81 201 Z" fill={fill('thighL')} />
        <path d="M42 268 L56 268 C56 286 55 302 54 314 C53 322 52 328 51 332 L42 332 C41 326 40 318 39 306 C38 293 39 280 42 268 Z" fill={fill('legR')} />
        <path d="M78 268 L64 268 C64 286 65 302 66 314 C67 322 68 328 69 332 L78 332 C79 326 80 318 81 306 C82 293 81 280 78 268 Z" fill={fill('legL')} />
        <ellipse cx="48.5" cy="268" rx="8.5" ry="8" fill={fill('kneeR')} />
        <ellipse cx="71.5" cy="268" rx="8.5" ry="8" fill={fill('kneeL')} />
        <path d="M41 332 L52 332 C53 337 55 340 59 342 C62 343 62 346 58 346 L40 346 C37 346 36 344 36 341 C36 337 38 334 41 332 Z" fill={fill('footR')} />
        <path d="M79 332 L68 332 C67 337 65 340 61 342 C58 343 58 346 62 346 L80 346 C83 346 84 344 84 341 C84 337 82 334 79 332 Z" fill={fill('footL')} />
      </svg>

      <ul className="flex flex-col gap-2">
        {regions.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 rounded-lg border border-[#F0F0F4] bg-[#FAFAFC] px-4 py-2.5">
            <span className="text-[13.5px] font-bold text-ink">{r.label}</span>
            <span className="flex items-center gap-2">
              <span className="text-[12px] text-slate-500">
                {r.after} visit{r.after === 1 ? '' : 's'}
              </span>
              <VerdictBadge verdict={r.verdict} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bar({ value, max, color, caption }: { value: number; max: number; color: string; caption: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
          <div className="flex h-full items-center justify-end rounded-md pr-1.5" style={{ width: `${Math.max(pct, value > 0 ? 12 : 0)}%`, background: color }}>
            {value > 0 && <span className="text-[11px] font-bold text-white">{value}</span>}
          </div>
        </div>
      </div>
      <div className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">{caption}</div>
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
