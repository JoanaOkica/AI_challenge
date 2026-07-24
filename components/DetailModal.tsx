'use client';

import { useState } from 'react';
import type { TimelineNode } from '@/lib/resolve';
import type { ResolvedRow } from '@/lib/types';
import { REGION_LABELS } from '@/lib/types';
import { fmtDate } from '@/lib/format';
import { partLabel } from '@/lib/labels';
import { highlightSummary } from '@/lib/highlight';
import BodySilhouette from './BodySilhouette';
import Modal from './Modal';
import { CategoryBadge, ReasonBadge, PdfBadge } from './ui';

interface DetailModalProps {
  node: TimelineNode | null;
  onClose: () => void;
  onNote: (rowId: string, text: string) => void;
  onToggleStar: (rowId: string) => void;
  onToggleSuppress: (rowId: string) => void;
  onSetTZero: (rowId: string) => void;
}

export default function DetailModal({
  node,
  onClose,
  onNote,
  onToggleStar,
  onToggleSuppress,
  onSetTZero,
}: DetailModalProps) {
  if (!node) return null;

  return (
    <Modal
      open={!!node}
      onClose={onClose}
      widthClass="max-w-3xl"
      title={
        <div className="flex items-center gap-2">
          <span>{fmtDate(node.date)}</span>
          <CategoryBadge category={node.category} />
          {node.reason && node.reason !== 'category' && <ReasonBadge reason={node.reason} />}
          {node.isTZero && (
            <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">T-Zero</span>
          )}
        </div>
      }
    >
      {/* Body view header */}
      <div className="mb-4 flex gap-4 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <div className="shrink-0">
          <BodySilhouette parts={node.parts} size={96} showSideTicks />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Regions on this node
          </div>
          {node.parts.length === 0 ? (
            <p className="text-sm italic text-slate-400">No body region coded on these records.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {node.parts.map((p, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-inset ring-slate-200"
                  title={REGION_LABELS[p.region]}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: 'rgba(120,86,255,0.7)' }} />
                  {partLabel(p.id)}
                  {p.laterality && <span className="font-semibold text-accent">· {p.laterality}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {node.rows.length} record{node.rows.length === 1 ? '' : 's'} on this date
      </div>
      <div className="space-y-3">
        {node.rows.map((row) => (
          <RowCard
            key={row.rowId}
            row={row}
            onNote={onNote}
            onToggleStar={onToggleStar}
            onToggleSuppress={onToggleSuppress}
            onSetTZero={onSetTZero}
          />
        ))}
      </div>
    </Modal>
  );
}

function RowCard({
  row,
  onNote,
  onToggleStar,
  onToggleSuppress,
  onSetTZero,
}: {
  row: ResolvedRow;
  onNote: (rowId: string, text: string) => void;
  onToggleStar: (rowId: string) => void;
  onToggleSuppress: (rowId: string) => void;
  onSetTZero: (rowId: string) => void;
}) {
  const [showPdf, setShowPdf] = useState(false);
  const segments = highlightSummary(row.summary, row.bodyPartsRaw);

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800">{row.recordType || '(untyped record)'}</div>
          <div className="text-xs text-slate-500">
            {[row.provider, row.facility, row.medicineType].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        <PdfBadge pdf={row.pdf} />
      </div>

      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        {segments.map((s, i) =>
          s.kind ? (
            <mark key={i} className={`hl-${s.kind}`}>
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>

      {row.bates && (row.bates.begin || row.bates.end || row.bates.page) && (
        <div className="mt-2 inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
          Bates {row.bates.begin}
          {row.bates.end ? `–${row.bates.end}` : ''}
          {row.bates.page ? ` · p.${row.bates.page}` : ''}
        </div>
      )}

      {/* PDF embed */}
      {row.pdf.kind === 'real' && row.pdf.embedHref && (
        <div className="mt-2">
          {showPdf ? (
            <iframe
              src={row.pdf.embedHref}
              className="h-72 w-full rounded border border-slate-200"
              title="Produced document preview"
            />
          ) : (
            <button
              onClick={() => setShowPdf(true)}
              className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
            >
              Preview produced document
            </button>
          )}
        </div>
      )}
      {row.pdf.kind === 'placeholder' && (
        <div className="mt-2 text-[11px] italic text-slate-400">
          No document produced — the source cell points at a placeholder search, not a record.
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
        <button
          onClick={() => onToggleStar(row.rowId)}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
            row.starred
              ? 'bg-amber-50 text-amber-700 ring-amber-200'
              : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>{row.starred ? '★' : '☆'}</span>
          {row.starred ? 'Milestone' : 'Mark as milestone'}
        </button>
        <button
          onClick={() => onSetTZero(row.rowId)}
          disabled={row.isTZero}
          className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
            row.isTZero
              ? 'cursor-default bg-accent text-white ring-accent'
              : 'bg-white text-accent ring-[#E3DCFB] hover:bg-[#F0EEFF]'
          }`}
        >
          {row.isTZero ? 'T-Zero anchor' : 'Set as T-Zero'}
        </button>
        <button
          onClick={() => onToggleSuppress(row.rowId)}
          className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
        >
          {row.suppressed ? 'Restore to timeline' : 'Suppress from timeline'}
        </button>
      </div>

      {/* Work-product note */}
      <NoteEditor rowId={row.rowId} initial={row.note ?? ''} onSave={onNote} />
    </div>
  );
}

function NoteEditor({
  rowId,
  initial,
  onSave,
}: {
  rowId: string;
  initial: string;
  onSave: (rowId: string, text: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <div className="mt-2.5 rounded-md border border-dashed border-amber-300 bg-amber-50/60 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
          Attorney note — work product, excluded from exports
        </span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onSave(rowId, draft)}
        placeholder="Private note on this encounter…"
        rows={2}
        className="w-full resize-y rounded border border-amber-200 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none"
      />
    </div>
  );
}
