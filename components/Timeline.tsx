'use client';

import { useMemo } from 'react';
import type { TimelineNode } from '@/lib/resolve';
import type { GapBand, PdfLink } from '@/lib/types';
import { fmtDateShort, fmtDate } from '@/lib/format';
import BodySilhouette from './BodySilhouette';
import { CategoryBadge, ReasonBadge, PdfBadge } from './ui';

const PAD_L = 56;
const PAD_R = 56;
const AXIS_Y = 46;
const LANE_TOP = 74;
const LANE_H = 176;
const NODE_W = 150;
const LANE_GAP = 14;

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

function bestPdf(node: TimelineNode): PdfLink {
  const real = node.rows.find((r) => r.pdf.kind === 'real');
  if (real) return real.pdf;
  const placeholder = node.rows.find((r) => r.pdf.kind === 'placeholder');
  return placeholder?.pdf ?? node.rows[0]?.pdf ?? { kind: 'none', href: null, embedHref: null };
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function buildTicks(min: Date, max: Date): { date: Date; label: string }[] {
  const spanDays = (+max - +min) / 86_400_000;
  const stepMonths = spanDays <= 180 ? 1 : spanDays <= 540 ? 3 : spanDays <= 1500 ? 6 : 12;
  const ticks: { date: Date; label: string }[] = [];
  const cur = monthStart(min);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  while (+cur <= +max) {
    const label = stepMonths >= 12 ? `${cur.getFullYear()}` : `${MONTHS[cur.getMonth()]} '${String(cur.getFullYear()).slice(2)}`;
    ticks.push({ date: new Date(cur), label });
    cur.setMonth(cur.getMonth() + stepMonths);
  }
  return ticks;
}

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
  const layout = useMemo(() => {
    if (!dateExtent) return null;
    const { min, max } = dateExtent;
    const spanMs = Math.max(1, +max - +min);
    const trackWidth = Math.max(1000, nodes.length * 128);
    const innerW = trackWidth - PAD_L - PAD_R;
    const xOf = (d: Date) => PAD_L + (spanMs === 1 ? 0.5 : (+d - +min) / spanMs) * innerW;
    const clampLeft = (x: number) => Math.max(6, Math.min(x - NODE_W / 2, trackWidth - NODE_W - 6));

    // Lane packing to avoid horizontal overlap while keeping x time-proportional.
    const sorted = [...nodes].sort((a, b) => +a.date - +b.date);
    const laneRight: number[] = [];
    const placed = sorted.map((node) => {
      const x = xOf(node.date);
      const left = clampLeft(x);
      let lane = 0;
      while (lane < laneRight.length && laneRight[lane] > left - LANE_GAP) lane++;
      laneRight[lane] = left + NODE_W;
      return { node, x, left, top: LANE_TOP + lane * LANE_H, lane };
    });
    const lanes = Math.max(1, laneRight.length);
    const trackHeight = LANE_TOP + lanes * LANE_H;
    const ticks = buildTicks(min, max).map((t) => ({ ...t, x: xOf(t.date) }));
    const tZeroX = tZeroDate ? xOf(tZeroDate) : null;
    const gapRects = gaps
      .map((g) => ({ g, x1: xOf(g.start), x2: xOf(g.end) }))
      .filter((r) => r.x2 - r.x1 > 6);

    return { trackWidth, trackHeight, xOf, placed, ticks, tZeroX, gapRects };
  }, [nodes, gaps, dateExtent, tZeroDate]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Timeline</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            {nodes.length} node{nodes.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <label className="flex items-center gap-1.5">
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
          <Legend />
        </div>
      </div>

      {!layout ? (
        <div className="px-4 py-16 text-center text-sm text-slate-400">
          No dated records in this view. Check the Unassigned drawer, or widen your filters.
        </div>
      ) : (
        <div className="overflow-x-auto scroll-thin">
          <div className="relative" style={{ width: layout.trackWidth, height: layout.trackHeight }}>
            <svg
              width={layout.trackWidth}
              height={layout.trackHeight}
              className="absolute inset-0"
              style={{ pointerEvents: 'none' }}
            >
              {/* pre/post background tints */}
              {layout.tZeroX != null && (
                <>
                  <rect x={0} y={0} width={layout.tZeroX} height={layout.trackHeight} fill="#f8fafc" />
                  <rect
                    x={layout.tZeroX}
                    y={0}
                    width={layout.trackWidth - layout.tZeroX}
                    height={layout.trackHeight}
                    fill="rgba(120,86,255,0.05)"
                  />
                </>
              )}

              {/* gap bands */}
              {layout.gapRects.map((r, i) => (
                <g key={i}>
                  <rect x={r.x1} y={AXIS_Y - 6} width={r.x2 - r.x1} height={layout.trackHeight - AXIS_Y + 6} fill="rgba(245,158,11,0.08)" />
                  <line x1={r.x1} y1={AXIS_Y} x2={r.x2} y2={AXIS_Y} stroke="#f59e0b" strokeWidth={2} strokeDasharray="2 3" />
                  <text
                    x={(r.x1 + r.x2) / 2}
                    y={AXIS_Y - 12}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#b45309"
                    fontWeight={600}
                  >
                    Gap in records produced · {r.g.days}d
                  </text>
                </g>
              ))}

              {/* axis */}
              <line x1={PAD_L - 10} y1={AXIS_Y} x2={layout.trackWidth - PAD_R + 10} y2={AXIS_Y} stroke="#cbd5e1" strokeWidth={1.5} />
              {layout.ticks.map((t, i) => (
                <g key={i}>
                  <line x1={t.x} y1={AXIS_Y - 4} x2={t.x} y2={AXIS_Y + 4} stroke="#cbd5e1" strokeWidth={1} />
                  <text x={t.x} y={AXIS_Y - 10} textAnchor="middle" fontSize="10" fill="#94a3b8">
                    {t.label}
                  </text>
                </g>
              ))}

              {/* T-Zero splitter */}
              {layout.tZeroX != null && (
                <g>
                  <line x1={layout.tZeroX} y1={20} x2={layout.tZeroX} y2={layout.trackHeight} stroke="#7856FF" strokeWidth={1.5} strokeDasharray="4 3" />
                  <rect x={layout.tZeroX - 26} y={6} width={52} height={16} rx={3} fill="#7856FF" />
                  <text x={layout.tZeroX} y={17} textAnchor="middle" fontSize="10" fill="#fff" fontWeight={700}>
                    T-ZERO
                  </text>
                </g>
              )}

              {/* connectors + dots */}
              {layout.placed.map(({ node, x, top }) => (
                <g key={node.key}>
                  <line x1={x} y1={AXIS_Y} x2={x} y2={top} stroke="#e2e8f0" strokeWidth={1.5} />
                  <circle cx={x} cy={AXIS_Y} r={4} fill={node.isTZero ? '#7856FF' : '#94a3b8'} />
                </g>
              ))}
            </svg>

            {/* node cards */}
            {layout.placed.map(({ node, left, top }) => (
              <button
                key={node.key}
                onClick={() => (pickingTZero ? onPickTZero(node) : onSelectNode(node))}
                style={{ position: 'absolute', left, top, width: NODE_W }}
                className={`group flex flex-col items-stretch gap-1.5 rounded-lg border bg-white p-2 text-left shadow-sm transition hover:shadow-md ${
                  node.isTZero ? 'border-accent ring-1 ring-accent/40' : 'border-slate-200 hover:border-accent'
                } ${pickingTZero ? 'cursor-crosshair hover:ring-2 hover:ring-accent' : ''}`}
                title={fmtDate(node.date)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500">{fmtDateShort(node.date)}</span>
                  {node.rows.length > 1 && (
                    <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">
                      ×{node.rows.length}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <CategoryBadge category={node.category} />
                  {node.reason && node.reason !== 'category' && <ReasonBadge reason={node.reason} />}
                </div>
                <div className="flex items-center justify-center py-0.5">
                  {node.parts.length > 0 ? (
                    <BodySilhouette parts={node.parts} size={44} />
                  ) : (
                    <div className="flex h-[92px] items-center px-2 text-center text-[10px] italic text-slate-300">
                      no body region coded
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="truncate text-[10px] text-slate-400" title={node.rows[0]?.recordType}>
                    {node.rows[0]?.recordType || '—'}
                  </span>
                  <PdfBadge pdf={bestPdf(node)} compact />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: 'rgba(120,86,255,0.6)' }} /> region affected
      </span>
      <span className="flex items-center gap-1">
        <span className="hatch-unknown inline-block h-3 w-3 rounded-sm ring-1 ring-accent/40" /> side unspecified
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: 'rgba(245,158,11,0.35)' }} /> gap
      </span>
    </div>
  );
}
