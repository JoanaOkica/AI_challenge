'use client';

import { useMemo } from 'react';
import type { TimelineNode } from '@/lib/resolve';
import type { GapBand, NodeCategory } from '@/lib/types';
import { fmtDate } from '@/lib/format';
import { classify } from '@/lib/milestones';
import StoryFigure from './StoryFigure';

const CARD_H = 210;
const DOT_GAP = 16;
const ROW_PT = 8;
const AXIS_TOP = ROW_PT + CARD_H + DOT_GAP + 8;

interface TimelineProps {
  nodes: TimelineNode[];
  gaps: GapBand[];
  dateExtent: { min: Date; max: Date } | null;
  tZeroDate: Date | null;
  gapDays: number;
  onGapDays: (n: number) => void;
  onSelectNode: (n: TimelineNode) => void;
  pickingTZero: boolean;
  onPickTZero: (n: TimelineNode) => void;
}

interface BandMeta {
  bg: string;
  fg: string;
  dot: string;
}
const BAND: Record<NodeCategory, BandMeta> = {
  SURGERY: { bg: '#16294f', fg: '#fff', dot: '#16294f' },
  EMS: { bg: '#d92d2d', fg: '#fff', dot: '#d92d2d' },
  ER: { bg: '#e2482e', fg: '#fff', dot: '#e2482e' },
  DISCHARGE: { bg: '#3f88d6', fg: '#fff', dot: '#3f88d6' },
  IME: { bg: '#6d4fb3', fg: '#fff', dot: '#6d4fb3' },
  IMAGING: { bg: '#d9dce3', fg: '#3a4152', dot: '#8b93a3' },
  WORKSTATUS: { bg: '#47707e', fg: '#fff', dot: '#47707e' },
  LEGAL: { bg: '#2f3a4d', fg: '#fff', dot: '#2f3a4d' },
  ANCHOR: { bg: '#4b5162', fg: '#fff', dot: '#4b5162' },
  ENCOUNTER: { bg: '#8a95a7', fg: '#fff', dot: '#8a95a7' },
};

const CAT_BAND_LABEL: Partial<Record<NodeCategory, string>> = {
  SURGERY: 'SURGERY',
  EMS: 'EMS',
  ER: 'ER',
  DISCHARGE: 'DISCHARGE',
  IME: 'IME',
  LEGAL: 'LEGAL',
  IMAGING: 'IMAGING',
  WORKSTATUS: 'WORK STATUS',
};
const LABEL_SHORT: Record<string, string> = {
  'Emergency Department Triage': 'ER Triage',
  'Independent Medical Examination': 'IME Exam',
};

function mmddyyyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}
function bandLabel(node: TimelineNode): string {
  if (CAT_BAND_LABEL[node.category]) return CAT_BAND_LABEL[node.category]!;
  const rt = node.rows[0]?.recordType || 'Record';
  const words = rt.split(/\s+/);
  return (words[words.length - 1] || rt).toUpperCase().slice(0, 11);
}
function shortLabel(node: TimelineNode): string {
  const rt = node.rows[0]?.recordType || '';
  return LABEL_SHORT[rt] ?? rt;
}
function nodePdfKind(node: TimelineNode): 'real' | 'placeholder' | 'none' {
  if (node.rows.some((r) => r.pdf.kind === 'real')) return 'real';
  if (node.rows.some((r) => r.pdf.kind === 'placeholder')) return 'placeholder';
  return 'none';
}
function gapText(days: number, baseline: boolean): string {
  const magnitude = days >= 240 ? `≈${Math.round(days / 30.44)} months` : `${days} days`;
  return `${magnitude} · ${baseline ? 'no records produced' : 'gap in records produced'}`;
}

type Item =
  | { kind: 'node'; node: TimelineNode }
  | { kind: 'gap'; text: string }
  | { kind: 'tzero' };

export default function Timeline({
  nodes,
  gaps,
  dateExtent,
  tZeroDate,
  gapDays,
  onGapDays,
  onSelectNode,
  pickingTZero,
  onPickTZero,
}: TimelineProps) {
  const items = useMemo<Item[]>(() => {
    const sorted = [...nodes].sort((a, b) => +a.date - +b.date);
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    // gap.start day -> gap text (baseline if the gap closes on/before T-Zero)
    const gapByStart = new Map<string, string>();
    for (const g of gaps) {
      const baseline = !!tZeroDate && +g.end <= +tZeroDate;
      gapByStart.set(dayKey(g.start), gapText(g.days, baseline));
    }
    const out: Item[] = [];
    let tzPlaced = !tZeroDate;
    for (const node of sorted) {
      if (!tzPlaced && tZeroDate && +node.date >= +tZeroDate) {
        out.push({ kind: 'tzero' });
        tzPlaced = true;
      }
      out.push({ kind: 'node', node });
      const gt = gapByStart.get(dayKey(node.date));
      if (gt) out.push({ kind: 'gap', text: gt });
    }
    return out;
  }, [nodes, gaps, tZeroDate]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-bold text-ink">The story of the injury</h2>
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <label className="flex items-center gap-1.5" title="Days with no records before a gap is flagged">
            <span>Gap threshold</span>
            <input
              type="number"
              min={7}
              step={7}
              value={gapDays}
              onChange={(e) => onGapDays(Math.max(7, Number(e.target.value) || 60))}
              className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-slate-700 focus:border-accent focus:outline-none"
            />
            <span>days</span>
          </label>
          <span className="flex items-center gap-1.5 font-semibold text-slate-500">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#f2b104' }} /> Region affected
          </span>
        </div>
      </div>

      {!dateExtent || nodes.length === 0 ? (
        <div className="px-4 py-16 text-center text-sm text-slate-400">
          No dated records in this view. Check the Unassigned drawer, or widen your filters.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 pt-3 text-[10.5px] font-extrabold tracking-[0.09em]">
            <span className="text-slate-400">◀ BASELINE</span>
            <span className="text-accent">POST-INCIDENT ▶</span>
          </div>
          <div className="overflow-x-auto scroll-thin">
            <div className="relative flex w-max items-start gap-3.5 px-4 pb-2" style={{ paddingTop: ROW_PT }}>
              {/* dotted axis */}
              <div
                className="pointer-events-none absolute left-0 right-0 border-t-2 border-dotted border-[#c9cfdc]"
                style={{ top: AXIS_TOP }}
              />
              {items.map((item, i) => {
                if (item.kind === 'tzero') {
                  return (
                    <div key={'tz' + i} className="relative w-3.5 self-stretch" aria-hidden>
                      <span
                        className="absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-full bg-[#d92d2d] px-2.5 py-[3px] text-[9.5px] font-extrabold tracking-[0.08em] text-white"
                        style={{ top: 4 }}
                      >
                        T-ZERO
                      </span>
                      <div
                        className="absolute left-1/2 border-l-2 border-dashed border-[#c9cfdc]"
                        style={{ top: 26, height: CARD_H + DOT_GAP + 2 }}
                      />
                    </div>
                  );
                }
                if (item.kind === 'gap') {
                  return (
                    <div key={'gap' + i} className="flex flex-col items-center">
                      <div className="flex items-center" style={{ height: CARD_H }}>
                        <div className="flex w-[116px] flex-col items-center gap-1.5 rounded-[10px] border border-dashed border-[#c9cfdc] bg-slate-50 px-2.5 py-3 text-center text-[10.5px] font-semibold leading-snug text-slate-400">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
                            <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span>{item.text}</span>
                        </div>
                      </div>
                      <div style={{ height: 16, marginTop: DOT_GAP }} />
                    </div>
                  );
                }
                const node = item.node;
                const meta = BAND[node.category];
                return (
                  <div key={node.key} className="flex flex-col items-center">
                    <div className="flex items-stretch" style={{ height: CARD_H }}>
                      <button
                        onClick={() => (pickingTZero ? onPickTZero(node) : onSelectNode(node))}
                        title={fmtDate(node.date)}
                        className={`flex w-[136px] flex-col rounded-[10px] border bg-white p-2 text-left shadow-card transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md ${
                          node.isTZero ? 'border-[#d92d2d] ring-1 ring-[#d92d2d]/30' : 'border-slate-200'
                        } ${pickingTZero ? 'cursor-crosshair' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[10px] font-semibold text-slate-500">{mmddyyyy(node.date)}</span>
                          <span className="flex items-center gap-1">
                            {node.rows.length > 1 && (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-1 text-[9px] font-bold text-slate-500">
                                ×{node.rows.length}
                              </span>
                            )}
                            <DocIcon kind={nodePdfKind(node)} />
                          </span>
                        </div>
                        <div
                          className="mx-[-8px] mt-[7px] flex items-center justify-between px-2 py-[3.5px] text-[10px] font-extrabold tracking-[0.06em]"
                          style={{ background: meta.bg, color: meta.fg }}
                        >
                          <span>{bandLabel(node)}</span>
                          <span className="h-1.5 w-1.5 rounded-full opacity-90" style={{ background: 'currentColor' }} />
                        </div>
                        <div className="flex flex-1 items-center justify-center py-1">
                          {node.parts.length > 0 ? (
                            <StoryFigure parts={node.parts} size={104} />
                          ) : (
                            <span className="px-2 text-center text-[9.5px] italic text-slate-300">no body region coded</span>
                          )}
                        </div>
                        <div className="truncate text-center text-[10.5px] font-semibold text-slate-600" title={shortLabel(node)}>
                          {shortLabel(node)}
                        </div>
                      </button>
                    </div>
                    <div className="relative z-[1] flex items-center justify-center" style={{ height: 16, marginTop: DOT_GAP }}>
                      <span
                        className="grid h-[15px] w-[15px] place-items-center rounded-full bg-white"
                        style={{ border: `2.5px solid ${meta.dot}` }}
                      >
                        <span className="h-[5px] w-[5px] rounded-full" style={{ background: meta.dot }} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function DocIcon({ kind }: { kind: 'real' | 'placeholder' | 'none' }) {
  const color = kind === 'real' ? '#2e7cd6' : '#b3bac9';
  return (
    <span title={kind === 'real' ? 'Produced document linked' : 'No document produced'}>
      <svg width="11" height="13" viewBox="0 0 12 14" fill="none">
        <path d="M2 1h5l3 3v9H2z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M7 1v3h3" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
