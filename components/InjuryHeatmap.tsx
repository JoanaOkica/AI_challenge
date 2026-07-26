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

type Shape =
  | { slot: string; kind: 'path'; d: string }
  | { slot: string; kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

/**
 * Anatomical silhouette (viewBox -6 0 132 350) — kept identical to the
 * standalone artifact's Body Map so both surfaces read the same in a demo.
 * Each region is one continuous shape, so a lit zone looks like a body part
 * rather than a stack of boxes. The patella is drawn last so it bridges the
 * thigh/shin seam; it is part of the leg slot because bodyMap maps `knee` onto
 * the leg zone, so a meniscus tear lights the kneecap itself.
 */
const SHAPES: Shape[] = [
  { slot: 'head', kind: 'ellipse', cx: 60, cy: 30, rx: 18, ry: 22 },
  { slot: 'neck', kind: 'path', d: 'M52 46 L68 46 L69 60 C69 63 66 64 60 64 C54 64 51 63 51 60 Z' },
  { slot: 'torsoUpper', kind: 'path', d: 'M60 61 C71 61 80 64 86 69 C91 74 93 81 93 89 L91 118 C90 132 87 143 84 151 L36 151 C33 143 30 132 29 118 L27 89 C27 81 29 74 34 69 C40 64 49 61 60 61 Z' },
  { slot: 'torsoLower', kind: 'path', d: 'M36 151 L84 151 C83 163 82 173 81 181 C80 191 77 198 71 201 L49 201 C43 198 40 191 39 181 C38 173 37 163 36 151 Z' },
  { slot: 'armR', kind: 'path', d: 'M33 67 C25 70 20 79 18 93 L14 148 C13 166 12 184 12 197 C12 202 14 205 18 205 L23 205 C26 205 28 202 28 197 C28 184 28 167 29 150 L33 97 C34 86 36 77 39 70 Z' },
  { slot: 'armL', kind: 'path', d: 'M87 67 C95 70 100 79 102 93 L106 148 C107 166 108 184 108 197 C108 202 106 205 102 205 L97 205 C94 205 92 202 92 197 C92 184 92 167 91 150 L87 97 C86 86 84 77 81 70 Z' },
  { slot: 'handR', kind: 'ellipse', cx: 20, cy: 213, rx: 8, ry: 11 },
  { slot: 'handL', kind: 'ellipse', cx: 100, cy: 213, rx: 8, ry: 11 },
  { slot: 'thighR', kind: 'path', d: 'M39 201 L58 201 L58 232 C58 246 57 258 56 268 L41 268 C39 258 37 246 36 232 C35 220 36 209 39 201 Z' },
  { slot: 'thighL', kind: 'path', d: 'M81 201 L62 201 L62 232 C62 246 63 258 64 268 L79 268 C81 258 83 246 84 232 C85 220 84 209 81 201 Z' },
  { slot: 'legR', kind: 'path', d: 'M42 268 L56 268 C56 286 55 302 54 314 C53 322 52 328 51 332 L42 332 C41 326 40 318 39 306 C38 293 39 280 42 268 Z' },
  { slot: 'legL', kind: 'path', d: 'M78 268 L64 268 C64 286 65 302 66 314 C67 322 68 328 69 332 L78 332 C79 326 80 318 81 306 C82 293 81 280 78 268 Z' },
  { slot: 'footR', kind: 'path', d: 'M41 332 L52 332 C53 337 55 340 59 342 C62 343 62 346 58 346 L40 346 C37 346 36 344 36 341 C36 337 38 334 41 332 Z' },
  { slot: 'footL', kind: 'path', d: 'M79 332 L68 332 C67 337 65 340 61 342 C58 343 58 346 62 346 L80 346 C83 346 84 344 84 341 C84 337 82 334 79 332 Z' },
  { slot: 'kneeR', kind: 'ellipse', cx: 48.5, cy: 268, rx: 8.5, ry: 8 },
  { slot: 'kneeL', kind: 'ellipse', cx: 71.5, cy: 268, rx: 8.5, ry: 8 },
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
    case 'armL':
      return 'armL';
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
    case 'kneeL':
      return 'kneeL';
    case 'kneeR':
      return 'kneeR';
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
      <svg viewBox="-6 0 132 352" className="h-[320px] w-full max-w-[220px]">
        {SHAPES.map((sh, i) => {
          const zone = slotZone(sh.slot, aspect);
          const level = zone ? (excluded.has(zone) ? 'none' : bucket(counts[zone])) : 'none';
          const fill = FLAG_COLOR[level];
          const common = {
            fill,
            style: { cursor: zone ? 'pointer' : 'default', transition: 'fill .15s' },
            onClick: () => zone && onToggle(zone),
          };
          const title = zone
            ? `${ZONE_LABELS[zone]} — ${excluded.has(zone) ? 'excluded as pre-existing' : `${counts[zone]} encounter${counts[zone] === 1 ? '' : 's'}`}`
            : undefined;
          // Two shapes share the leg slot (limb + patella), so key on index.
          if (sh.kind === 'ellipse') {
            return (
              <ellipse key={`${sh.slot}-${i}`} cx={sh.cx} cy={sh.cy} rx={sh.rx} ry={sh.ry} {...common}>
                {title && <title>{title}</title>}
              </ellipse>
            );
          }
          return (
            <path key={`${sh.slot}-${i}`} d={sh.d} {...common}>
              {title && <title>{title}</title>}
            </path>
          );
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
