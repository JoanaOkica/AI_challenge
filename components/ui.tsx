'use client';

import { CATEGORY_META, type NodeCategory, type PdfLink, type CausationVerdict } from '@/lib/types';
import type { MilestoneNode } from '@/lib/milestones';

export function CategoryBadge({ category }: { category: NodeCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

const REASON_LABELS: Record<MilestoneNode['reason'], string> = {
  category: 'Milestone event',
  'first-record': 'First record',
  'last-record': 'Latest record',
  'user-starred': 'Marked by you',
  'first-mmi': 'First MMI',
  't-zero': 'T-Zero anchor',
};

export function ReasonBadge({ reason }: { reason?: MilestoneNode['reason'] }) {
  if (!reason) return null;
  return (
    <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
      {REASON_LABELS[reason]}
    </span>
  );
}

export function PdfBadge({ pdf, compact = false }: { pdf: PdfLink; compact?: boolean }) {
  if (pdf.kind === 'real' && pdf.href) {
    return (
      <a
        href={pdf.href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200 hover:bg-sky-100"
        title="Open produced document"
      >
        <DocIcon />
        {!compact && 'PDF'}
      </a>
    );
  }
  const label = pdf.kind === 'placeholder' ? 'no doc' : 'no link';
  return (
    <span
      className="inline-flex cursor-help items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-400 ring-1 ring-inset ring-slate-200"
      title={pdf.note ?? 'no document produced'}
    >
      <DocIcon muted />
      {!compact && label}
    </span>
  );
}

const VERDICT_META: Record<CausationVerdict, { cls: string; short: string }> = {
  'NEW POST-INCIDENT': { cls: 'bg-rose-100 text-rose-800 ring-rose-200', short: 'NEW' },
  'PRE-EXISTING, AGGRAVATED': { cls: 'bg-amber-100 text-amber-800 ring-amber-200', short: 'AGGRAVATED' },
  'PRE-EXISTING ONLY': { cls: 'bg-slate-200 text-slate-700 ring-slate-300', short: 'PRE-EXISTING' },
};

export function VerdictBadge({ verdict }: { verdict: CausationVerdict }) {
  const meta = VERDICT_META[verdict];
  return (
    <span
      title={verdict}
      className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${meta.cls}`}
    >
      {meta.short}
    </span>
  );
}

function DocIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg width="10" height="12" viewBox="0 0 12 14" fill="none" aria-hidden>
      <path
        d="M2 1h5l3 3v9H2z"
        stroke={muted ? '#94a3b8' : '#0369a1'}
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M7 1v3h3" stroke={muted ? '#94a3b8' : '#0369a1'} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
