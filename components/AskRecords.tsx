'use client';

import { useState } from 'react';
import type { ResolvedRow } from '@/lib/types';
import type { ResolvedView } from '@/lib/resolve';
import type { AskResponse } from '@/lib/ai';
import { ASK_SUGGESTIONS } from '@/lib/ai';
import { buildAskRequest } from '@/lib/aiBuild';
import { AccessRequiredError, postJson } from '@/lib/apiClient';
import { fmtDateShort } from '@/lib/format';
import AccessCodePrompt from './AccessCodePrompt';
import { PdfBadge } from './ui';

interface Props {
  view: ResolvedView;
  onOpenRow: (row: ResolvedRow) => void;
}

/**
 * Free-text Q&A over the produced records. The model answers only from the
 * chronology and returns the ids of the records it used, which we map back to
 * real rows so the lawyer can open the source rather than trust the prose.
 */
export default function AskRecords({ view, onOpenRow }: Props) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [cited, setCited] = useState<ResolvedRow[]>([]);
  const [asked, setAsked] = useState('');

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setNeedsCode(null);
    setAnswer(null);
    setCited([]);
    setAsked(text);
    try {
      const { payload, rows } = buildAskRequest(view, text);
      const res = await postJson<AskResponse>('/api/ask-records', payload);
      setAnswer(res);
      setCited(res.citedIds.map((i) => rows[i]).filter(Boolean));
    } catch (e) {
      if (e instanceof AccessRequiredError) setNeedsCode(e.message);
      else setError(e instanceof Error ? e.message : 'Could not answer that question.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-[#2a2d3d] dark:bg-[#1a1d27]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-[#2a2d3d]">
        <h2 className="text-sm font-semibold text-slate-800">Ask the record</h2>
        <span className="text-[11px] text-slate-400">
          answers come from the produced records and cite them
        </span>
      </div>

      <div className="px-4 py-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="When was the surgery? Which regions are new? Was there a treatment gap?"
            aria-label="Ask a question about this case"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[13px] text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={busy || !q.trim()}
            className="shrink-0 rounded-lg bg-[#1E2547] px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#2A3260] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Asking…' : 'Ask'}
          </button>
        </form>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {ASK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQ(s);
                ask(s);
              }}
              disabled={busy}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 transition hover:border-accent hover:bg-[#F7F5FF] hover:text-accent disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        {needsCode && (
          <div className="mt-3">
            <AccessCodePrompt message={needsCode} onSubmit={() => ask(asked)} />
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-700">
            {error}
          </div>
        )}

        {busy && (
          <div className="mt-3 flex items-center gap-2 text-[12.5px] text-slate-500">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="animate-spin">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Reading {view.visibleRows.length} records…
          </div>
        )}

        {answer && (
          <div className="mt-3">
            <div className="rounded-xl border border-[#E3DCFB] bg-[#FBFAFF] px-4 py-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-accent">Answer</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                  {answer.model}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#2A2E3D]">{answer.answer}</p>
            </div>

            {cited.length > 0 ? (
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {cited.length} source record{cited.length === 1 ? '' : 's'} — click to open
                </div>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                  {cited.map((r) => (
                    <li key={r.rowId}>
                      <button
                        onClick={() => onOpenRow(r)}
                        className="flex w-full items-start gap-3 px-3 py-2 text-left transition hover:bg-[#F7F5FF]"
                      >
                        <span className="w-16 shrink-0 pt-0.5 text-[11px] tabular-nums text-slate-500">
                          {fmtDateShort(r.encounterDate)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-semibold text-slate-700">
                            {r.recordType || '—'}
                            {r.provider ? <span className="font-normal text-slate-400"> · {r.provider}</span> : null}
                          </span>
                          <span className="block truncate text-[11.5px] text-slate-500">{r.summary}</span>
                        </span>
                        <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          <PdfBadge pdf={r.pdf} compact />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-[11.5px] italic text-slate-400">
                No specific record was cited for this answer — treat it with care and check the table below.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
