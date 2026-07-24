'use client';

import { useEffect, useRef, useState } from 'react';
import type { ResolvedRow } from '@/lib/types';
import { fmtDate } from '@/lib/format';
import { highlightSummary } from '@/lib/highlight';
import { partLabel } from '@/lib/labels';
import { PdfBadge } from './ui';

interface ReadingPaneProps {
  row: ResolvedRow | null;
  onClose: () => void;
  onOpenDetail: () => void;
}

export default function ReadingPane({ row, onClose, onOpenDetail }: ReadingPaneProps) {
  const [visible, setVisible] = useState(false);
  const prevRow = useRef<ResolvedRow | null>(null);

  useEffect(() => {
    if (row) {
      prevRow.current = row;
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [row]);

  // keep rendering the previous row during the close animation
  const displayRow = row ?? prevRow.current;
  if (!displayRow && !visible) return null;

  const segments = displayRow ? highlightSummary(displayRow.summary, displayRow.bodyPartsRaw) : [];

  return (
    <>
      {/* Scrim */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden
      />

      {/* Slide-in panel */}
      <aside
        role="complementary"
        aria-label="Record reader"
        className={`fixed right-0 top-0 z-50 flex h-screen w-full max-w-[480px] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 dark:border-[#2a2d3d] dark:bg-[#1a1d27] ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#2a2d3d]">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 dark:text-white">
              {displayRow?.recordType || 'Record'}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {[
                displayRow?.encounterDate ? fmtDate(displayRow.encounterDate) : null,
                displayRow?.provider,
                displayRow?.facility,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={onOpenDetail}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-[#2a2d3d] dark:bg-[#252836] dark:text-slate-300 dark:hover:bg-[#2f3244]"
            >
              Full detail
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#252836]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-y-auto scroll-thin">
          {/* Summary */}
          <div className="border-b border-slate-100 px-4 py-4 dark:border-[#2a2d3d]">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Summary</div>
            <p className="text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300">
              {segments.length > 0
                ? segments.map((s, i) =>
                    s.kind ? (
                      <mark key={i} className={`hl-${s.kind}`}>
                        {s.text}
                      </mark>
                    ) : (
                      <span key={i}>{s.text}</span>
                    ),
                  )
                : <span className="italic text-slate-400">No summary.</span>}
            </p>

            {displayRow?.bates && (displayRow.bates.begin || displayRow.bates.end || displayRow.bates.page) && (
              <div className="mt-2.5 inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                Bates {displayRow.bates.begin}
                {displayRow.bates.end ? `–${displayRow.bates.end}` : ''}
                {displayRow.bates.page ? ` · p.${displayRow.bates.page}` : ''}
              </div>
            )}
          </div>

          {/* Body regions */}
          {displayRow && displayRow.bodyParts.length > 0 && (
            <div className="border-b border-slate-100 px-4 py-3 dark:border-[#2a2d3d]">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Body regions</div>
              <div className="flex flex-wrap gap-1.5">
                {displayRow.bodyParts.map((p, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 dark:bg-[#252836] dark:text-slate-300"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    {partLabel(p.id)}
                    {p.laterality && <span className="font-semibold text-accent"> · {p.laterality}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Document viewer */}
          <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Source document</div>
              {displayRow && <PdfBadge pdf={displayRow.pdf} compact />}
            </div>

            {displayRow?.pdf.kind === 'real' && displayRow.pdf.embedHref ? (
              <iframe
                key={displayRow.rowId}
                src={displayRow.pdf.embedHref}
                className="min-h-[360px] flex-1 w-full rounded-xl border border-slate-200 dark:border-[#2a2d3d]"
                title="Source document"
              />
            ) : (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 dark:border-[#2a2d3d]">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-slate-300 dark:text-slate-600">
                  <path
                    d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <line x1="9" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <line x1="9" y1="17" x2="13" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <div className="text-center">
                  <div className="text-sm font-medium text-slate-400">
                    {displayRow?.pdf.kind === 'placeholder' ? 'No document produced' : 'No document linked'}
                  </div>
                  {displayRow?.pdf.href && (
                    <a
                      href={displayRow.pdf.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block text-xs font-semibold text-accent hover:underline"
                    >
                      Open external link
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
