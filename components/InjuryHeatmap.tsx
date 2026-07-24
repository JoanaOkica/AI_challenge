'use client';

import { useMemo, useState } from 'react';
import type { CaseData } from '@/lib/types';
import type { ResolvedView } from '@/lib/resolve';
import { fmtDateISO } from '@/lib/format';
import {
  ALL_ZONES,
  FLAG_COLOR,
  FLAG_LEGEND,
  ZONE_LABELS,
  bucket,
  partToZones,
  type Zone,
} from '@/lib/heatmap';

type Phase = '90' | '12' | '12plus' | 'all';
type Aspect = 'anterior' | 'posterior';

const DAY = 86_400_000;

interface Shape {
  slot: string;
  kind: 'rect' | 'circle';
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  rx?: number;
}

/** Stylized figure geometry (viewBox 0 0 160 380). */
const SHAPES: Shape[] = [
  { slot: 'head', kind: 'circle', x: 80, y: 34, r: 22 },
  { slot: 'neck', kind: 'rect', x: 71, y: 55, w: 18, h: 12, rx: 4 },
  { slot: 'shoulderL', kind: 'rect', x: 24, y: 64, w: 18, h: 18, rx: 5 },
  { slot: 'shoulderR', kind: 'rect', x: 118, y: 64, w: 18, h: 18, rx: 5 },
  { slot: 'torsoUpper', kind: 'rect', x: 50, y: 66, w: 60, h: 60, rx: 11 },
  { slot: 'torsoLower', kind: 'rect', x: 55, y: 130, w: 50, h: 46, rx: 11 },
  { slot: 'armL', kind: 'rect', x: 25, y: 86, w: 16, h: 80, rx: 8 },
  { slot: 'armR', kind: 'rect', x: 119, y: 86, w: 16, h: 80, rx: 8 },
  { slot: 'handL', kind: 'circle', x: 33, y: 176, r: 8 },
  { slot: 'handR', kind: 'circle', x: 127, y: 176, r: 8 },
  { slot: 'thighL', kind: 'rect', x: 57, y: 184, w: 20, h: 72, rx: 9 },
  { slot: 'thighR', kind: 'rect', x: 83, y: 184, w: 20, h: 72, rx: 9 },
  { slot: 'legL', kind: 'rect', x: 58, y: 262, w: 16, h: 66, rx: 8 },
  { slot: 'legR', kind: 'rect', x: 86, y: 262, w: 16, h: 66, rx: 8 },
  { slot: 'footL', kind: 'rect', x: 56, y: 332, w: 20, h: 16, rx: 5 },
  { slot: 'footR', kind: 'rect', x: 84, y: 332, w: 20, h: 16, rx: 5 },
];

function slotZone(slot: string, aspect: Aspect): Zone | null {
  switch (slot) {
    case 'head':
      return 'head';
    case 'neck':
      return 'neck';
    case 'torsoUpper':
      return aspect === 'anterior' ? 'chest' : 'upperBack';
    case 'torsoLower':
      return aspect === 'anterior' ? 'abdomen' : 'lowerBack';
    case 'shoulderL':
    case 'armL':
      return 'armL';
    case 'shoulderR':
    case 'armR':
      return 'armR';
    case 'handL':
      return 'handL';
    case 'handR':
      return 'handR';
    case 'thighL':
      return 'thighL';
    case 'thighR':
      return 'thighR';
    case 'legL':
      return 'legL';
    case 'legR':
      return 'legR';
    case 'footL':
      return 'footL';
    case 'footR':
      return 'footR';
    default:
      return null;
  }
}

export default function InjuryHeatmap({ caseData, view }: { caseData: CaseData; view: ResolvedView }) {
  const [incidentISO, setIncidentISO] = useState<string>(() => fmtDateISO(view.tZeroDate));
  const [phase, setPhase] = useState<Phase>('90');
  const [hidePre, setHidePre] = useState(false);
  const [specialties, setSpecialties] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<Zone>>(new Set());

  const incidentDate = useMemo(() => (incidentISO ? new Date(incidentISO + 'T00:00:00') : null), [incidentISO]);

  const allSpecialties = useMemo(() => {
    const set = new Set<string>();
    for (const r of caseData.rows) if (r.medicineType?.trim()) set.add(r.medicineType.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [caseData.rows]);

  // zones that actually appear in the record — the exclusion list
  const presentZones = useMemo(() => {
    const set = new Set<Zone>();
    for (const r of caseData.rows) for (const p of r.bodyParts) for (const z of partToZones(p)) set.add(z);
    return ALL_ZONES.filter((z) => set.has(z));
  }, [caseData.rows]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(ALL_ZONES.map((z) => [z, 0])) as Record<Zone, number>;
    for (const row of caseData.rows) {
      if (specialties.size > 0 && !specialties.has(row.medicineType?.trim())) continue;
      const d = row.encounterDate;
      if (incidentDate) {
        if (!d) {
          if (phase !== 'all') continue;
        } else {
          const days = (+d - +incidentDate) / DAY;
          if (hidePre && days < 0) continue;
          if (phase === '90' && !(days >= 0 && days <= 90)) continue;
          if (phase === '12' && !(days >= 0 && days <= 365)) continue;
          if (phase === '12plus' && !(days > 365)) continue;
        }
      }
      const zones = new Set(row.bodyParts.flatMap(partToZones));
      for (const z of zones) if (!excluded.has(z)) c[z] += 1;
    }
    return c;
  }, [caseData.rows, incidentDate, phase, hidePre, specialties, excluded]);

  const toggleZone = (z: Zone) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(z)) next.delete(z);
      else next.add(z);
      return next;
    });

  const toggleSpecialty = (s: string) =>
    setSpecialties((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div className="mxfade flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Injury Heatmap</h1>
        <span className="text-sm font-medium text-slate-500">
          Where the treatment concentrated, by body region — a proxy for injury intensity.
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ---------------- figure ---------------- */}
        <section className="rounded-2xl border border-[#ECECF1] bg-white p-6 shadow-card">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-sm font-extrabold">Injury heatmap</h2>
            <p className="max-w-[220px] text-right text-[11px] leading-snug text-slate-400">
              Treatment-intensity proxy, not clinical judgment. Click a region to mark pre-existing / exclude.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Figure aspect="anterior" counts={counts} excluded={excluded} onToggle={toggleZone} />
            <Figure aspect="posterior" counts={counts} excluded={excluded} onToggle={toggleZone} />
          </div>

          <div className="mt-4 flex items-center justify-center gap-5">
            {FLAG_LEGEND.map((f) => (
              <span key={f.level} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <span className="h-3 w-3 rounded-sm" style={{ background: FLAG_COLOR[f.level] }} />
                {f.label}
              </span>
            ))}
          </div>
        </section>

        {/* ---------------- controls ---------------- */}
        <section className="flex flex-col gap-5 rounded-2xl border border-[#ECECF1] bg-white p-6 shadow-card">
          <div>
            <Label>Incident date</Label>
            <input
              type="date"
              value={incidentISO}
              onChange={(e) => setIncidentISO(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <Label>Phase</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                options={[
                  { id: '90', label: 'First 90d' },
                  { id: '12', label: 'First 12mo' },
                  { id: '12plus', label: '12mo+' },
                  { id: 'all', label: 'All' },
                ]}
                value={phase}
                onChange={(v) => setPhase(v as Phase)}
              />
              <label className="ml-1 inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-600">
                <input type="checkbox" checked={hidePre} onChange={(e) => setHidePre(e.target.checked)} className="accent-[#7856FF]" />
                Hide pre-incident records
              </label>
            </div>
            {!incidentDate && (
              <p className="mt-1.5 text-[11px] text-amber-600">Set an incident date to enable phase filtering.</p>
            )}
          </div>

          {allSpecialties.length > 0 && (
            <div>
              <Label>Specialty</Label>
              <div className="flex flex-wrap gap-2">
                {allSpecialties.map((s) => {
                  const on = specialties.has(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSpecialty(s)}
                      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${
                        on
                          ? 'border-[#D9CEFB] bg-[#F0EEFF] text-accent'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {s.replace(/\s+/g, '')}
                    </button>
                  );
                })}
              </div>
              {specialties.size === 0 && (
                <p className="mt-1.5 text-[11px] text-slate-400">None selected — showing every specialty.</p>
              )}
            </div>
          )}

          <div>
            <Label>Region exclusion (pre-existing)</Label>
            <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto scroll-thin pr-1 sm:grid-cols-3">
              {(presentZones.length ? presentZones : ALL_ZONES).map((z) => {
                const off = excluded.has(z);
                return (
                  <button
                    key={z}
                    onClick={() => toggleZone(z)}
                    className={`rounded-lg border px-3 py-2 text-[12.5px] font-medium transition ${
                      off
                        ? 'border-rose-200 bg-rose-50 text-rose-600 line-through'
                        : 'border-slate-200 bg-[#FAFAFC] text-slate-700 hover:bg-white'
                    }`}
                  >
                    {ZONE_LABELS[z]}
                  </button>
                );
              })}
            </div>
            {excluded.size > 0 && (
              <button
                onClick={() => setExcluded(new Set())}
                className="mt-2 text-[11.5px] font-semibold text-accent hover:underline"
              >
                Clear {excluded.size} exclusion{excluded.size === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Figure({
  aspect,
  counts,
  excluded,
  onToggle,
}: {
  aspect: Aspect;
  counts: Record<Zone, number>;
  excluded: Set<Zone>;
  onToggle: (z: Zone) => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
        {aspect === 'anterior' ? 'Anterior' : 'Posterior'}
      </div>
      <svg viewBox="0 0 160 360" className="h-[320px] w-full max-w-[220px]">
        {SHAPES.map((sh) => {
          const zone = slotZone(sh.slot, aspect);
          const level = zone ? (excluded.has(zone) ? 'none' : bucket(counts[zone])) : 'none';
          const fill = FLAG_COLOR[level];
          const common = {
            fill,
            style: { cursor: zone ? 'pointer' : 'default', transition: 'fill .15s' },
            onClick: () => zone && onToggle(zone),
          };
          if (sh.kind === 'circle') {
            return <circle key={sh.slot} cx={sh.x} cy={sh.y} r={sh.r} {...common} />;
          }
          return <rect key={sh.slot} x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={sh.rx} {...common} />;
        })}
      </svg>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{children}</div>;
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 shadow-sm">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 text-xs font-semibold transition ${
            value === o.id ? 'bg-accent text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
