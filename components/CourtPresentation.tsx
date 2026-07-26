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
            Gemini picks the case&rsquo;s shape, then writes plain jury captions. The slides render from the record.
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
          <ShapeBanner shape={result.shape} rationale={result.rationale} model={result.model} />
          <div className="flex flex-col gap-4">
            {result.slides.map((s, i) => (
              <SlideCard key={s.id} slide={s} index={i} total={result.slides.length} />
            ))}
          </div>
          <p className="px-1 text-[11px] text-slate-400">
            Demonstrative aid for trial. Slide figures trace to produced records; captions are AI-drafted and must be
            attorney-approved before display to a jury.
          </p>
        </>
      )}
    </div>
  );
}

function ShapeBanner({ shape, rationale, model }: { shape: CaseShape; rationale: string; model: string }) {
  return (
    <section className="rounded-2xl bg-gradient-to-br from-[#1B1730] via-[#2A2150] to-[#3A2B6B] p-6 text-white shadow-card">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold tracking-wide">
        STEP 1 · LLM CLASSIFIER
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px]">{model}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight">{SHAPE_LABELS[shape]}</h2>
        <span className="text-sm text-white/70">{SHAPE_BLURB[shape]}</span>
      </div>
      <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-white/85">
        <span className="font-bold text-white/90">Rationale: </span>
        {rationale}
      </p>
    </section>
  );
}

function SlideCard({ slide, index, total }: { slide: Slide; index: number; total: number }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#ECECF1] bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-[#F1F1F5] px-6 py-3">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-xs font-semibold text-slate-300">
            {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
          <span className="rounded-full bg-[#F0EEFF] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
            {slide.template.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div className="px-6 py-6">
        <h3 className="mb-5 text-xl font-extrabold tracking-tight text-ink">{slide.heading}</h3>
        <SlideBody slide={slide} />
      </div>

      {slide.caption && (
        <div className="border-t border-[#F1F1F5] bg-[#FBFAFF] px-6 py-4">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-accent">Jury caption</div>
          <p className="text-[15px] font-semibold leading-snug text-[#2A2E3D]">{slide.caption}</p>
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
    default:
      return null;
  }
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
