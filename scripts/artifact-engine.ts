/**
 * Browser entry point for the artifact's engine bundle.
 *
 * esbuild compiles this to an IIFE that is inlined into the artifact, so the
 * standalone page runs the same tested code as the app — real spreadsheet
 * ingest, real milestone/T-Zero resolution, real courtroom analysis — instead
 * of a hand-written imitation. Only the two LLM-backed modules stay static,
 * because a page with no server cannot call the API.
 *
 * Everything hung off `window.CP` is consumed by artifact-template.html.
 */

import * as XLSX from 'xlsx';

import { ingestWorkbook } from '../lib/ingest';
import { buildSampleCase } from '../lib/sampleData';
import { resolveView, EMPTY_FILTERS } from '../lib/resolve';
import { buildCourtroom } from '../lib/courtroom';
import { emptyWorkProduct } from '../lib/types';
import { DEFAULT_GAP_DAYS } from '../lib/gaps';
import { fmtDate, fmtDateShort, fmtDateISO, fmtSpan } from '../lib/format';
import { partLabel } from '../lib/labels';
import { classify } from '../lib/milestones';
import { ZONE_LABELS, ALL_ZONES, partToZones, bucket, FLAG_COLOR, FLAG_LEGEND } from '../lib/heatmap';
import { buildPresentationInput } from '../lib/aiBuild';
import { buildSlideSpecs, attachCaptions } from '../lib/presentation';
import { SHAPE_LABELS, SHAPE_BLURB } from '../lib/ai';
import { PRESET_ATTORNEY, SAMPLE_CAPTIONS, SAMPLE_SHAPE, SAMPLE_RATIONALE, SAMPLE_NARRATIVE } from './sample-ai-output';
import type { Zone } from '../lib/heatmap';
import type { CaseData } from '../lib/types';
import type { NormalizedBodyPart } from '../lib/bodyMap';
import type { TimelineNode, ResolvedView } from '../lib/resolve';

/* ------------------------------------------------------------------ *
 * Figure-zone mapping for the timeline's small front/back silhouettes  *
 * ------------------------------------------------------------------ */

function zonesFor(p: NormalizedBodyPart): { front: string[]; back: string[] } {
  const front: string[] = [];
  const back: string[] = [];
  const side = p.laterality;
  const L = side === 'left' || side === 'bilateral' || side == null;
  const R = side === 'right' || side === 'bilateral' || side == null;
  const lr = (base: string) => {
    if (L) front.push(base + 'L');
    if (R) front.push(base + 'R');
  };
  const id = p.id;
  const region = p.region;

  if (region === 'HEAD' || region === 'MIND') {
    front.push('head');
    back.push('headB');
  } else if (region === 'NECK') {
    back.push('neck');
  } else if (id === 'spine_thoracic') {
    back.push('upperBack');
  } else if (id === 'spine_lumbar' || id === 'spine_general') {
    back.push('lowerBack');
  } else if (id === 'buttocks') {
    back.push('buttocks');
  } else if (id === 'chest' || id === 'chest_systemic' || id === 'chest_lungs') {
    front.push('chest');
  } else if (id === 'abdomen') {
    front.push('abdomen');
  } else if (region === 'SYSTEMIC') {
    front.push('chest', 'abdomen');
  } else if (region === 'TORSO') {
    front.push('chest');
    back.push('lowerBack');
  } else if (id === 'shoulder') {
    lr('arm');
  } else if (id === 'wrist' || id === 'hand') {
    lr('hand');
  } else if (region === 'UPPER_EXT') {
    lr('arm');
  } else if (id === 'hip_pelvis') {
    front.push('pelvis');
  } else if (id === 'knee') {
    lr('knee');
  } else if (id === 'ankle' || id === 'foot') {
    lr('foot');
  } else if (id === 'leg_lower' || id === 'lower_extremity') {
    lr('shin');
  } else if (id === 'thigh') {
    lr('thigh');
  } else if (region === 'LOWER_EXT') {
    lr('thigh');
  }
  return { front, back };
}

function nodeZones(node: TimelineNode): { front: string[]; back: string[] } {
  const front = new Set<string>();
  const back = new Set<string>();
  for (const p of node.parts) {
    const z = zonesFor(p);
    z.front.forEach((x) => front.add(x));
    z.back.forEach((x) => back.add(x));
  }
  return { front: [...front], back: [...back] };
}

/* ------------------------------------------------------------------ *
 * View serialization — the shape artifact-template.html renders        *
 * ------------------------------------------------------------------ */

/** Run the engine over a case and flatten it into plain JSON for the page. */
function analyze(caseData: CaseData) {
  // Anchor T-Zero on the incident-day EMS record when the case has one.
  const ems = caseData.rows.find((r) => classify(r.recordType)?.category === 'EMS');
  const wp = emptyWorkProduct();
  if (ems) wp.tZeroRowId = ems.rowId;

  const view: ResolvedView = resolveView(caseData, wp, 'milestones', EMPTY_FILTERS, DEFAULT_GAP_DAYS);
  const courtroom = buildCourtroom(caseData.rows, view.tZeroDate);
  const s = caseData.stats;

  const nodes = view.nodes.map((n, i) => {
    const z = nodeZones(n);
    return {
      id: 'n' + i,
      dateISO: fmtDateISO(n.date),
      dateLabel: fmtDateShort(n.date),
      dateFull: fmtDate(n.date),
      category: n.category,
      reason: n.reason ?? null,
      count: n.rows.length,
      isTZero: n.isTZero,
      side: view.tZeroDate && +n.date >= +view.tZeroDate ? 'post' : 'baseline',
      front: z.front,
      back: z.back,
      parts: n.parts.map((p) => ({ label: partLabel(p.id), region: p.region, laterality: p.laterality })),
      rows: n.rows.map((r) => ({
        recordType: r.recordType,
        provider: r.provider,
        facility: r.facility,
        medicineType: r.medicineType,
        summary: r.summary,
        bodyPartsRaw: r.bodyPartsRaw,
        bates: r.bates?.begin ? r.bates.begin + (r.bates.end ? '–' + r.bates.end : '') : '',
        pdf: { kind: r.pdf.kind, href: r.pdf.href, embedHref: r.pdf.embedHref },
      })),
    };
  });

  const gaps = view.gaps.map((g) => {
    const before = [...nodes].reverse().find((n) => n.dateISO === fmtDateISO(g.start));
    return {
      days: g.days,
      startLabel: fmtDateShort(g.start),
      endLabel: fmtDateShort(g.end),
      afterNodeId: before?.id ?? null,
    };
  });

  const comparison = view.comparison.map((c) => ({
    label: c.label,
    region: c.region,
    laterality: c.laterality,
    before: c.before,
    after: c.after,
    firstSeen: fmtDateShort(c.firstMention),
    verdict: c.verdict,
  }));

  // Heatmap: encounters per figure zone, bucketed into flag levels.
  const zoneCounts = new Map<Zone, number>(ALL_ZONES.map((z) => [z, 0]));
  const zoneRows = new Map<Zone, { date: string; recordType: string }[]>(ALL_ZONES.map((z) => [z, []]));
  for (const row of view.allRows) {
    if (row.suppressed) continue;
    const hit = new Set<Zone>();
    for (const part of row.bodyParts) for (const z of partToZones(part)) hit.add(z);
    for (const z of hit) {
      zoneCounts.set(z, (zoneCounts.get(z) ?? 0) + 1);
      zoneRows.get(z)!.push({ date: fmtDateShort(row.encounterDate), recordType: row.recordType });
    }
  }
  const heatmap = {
    zones: ALL_ZONES.map((z) => {
      const count = zoneCounts.get(z) ?? 0;
      const level = bucket(count);
      return { id: z, label: ZONE_LABELS[z], count, level, color: FLAG_COLOR[level], rows: zoneRows.get(z)! };
    }),
    legend: FLAG_LEGEND.map((l) => ({ ...l, color: FLAG_COLOR[l.level] })),
  };

  const p = courtroom.posture;
  const start = s.dateSpan.start;
  const end = s.dateSpan.end;

  // Slides are built from real record data by the same deterministic templates
  // the API route uses. Captions and the shape rationale come from the model,
  // so they exist only for the sample case this page shipped with — an
  // uploaded case gets the real deck with the caption line left empty.
  const isSample = caseData.id === sampleCaseId;
  const presentationInput = buildPresentationInput(caseData, view, PRESET_ATTORNEY);
  const shape = SAMPLE_SHAPE;
  const slides = attachCaptions(
    buildSlideSpecs(shape, presentationInput),
    isSample ? SAMPLE_CAPTIONS : {},
  );

  return {
    id: caseData.id,
    caseName: caseData.name,
    disclaimer: caseData.warnings[0] ?? '',
    tzero: view.tZeroDate ? { iso: fmtDateISO(view.tZeroDate), label: fmtDateShort(view.tZeroDate) } : null,
    stats: {
      encounters: s.encounterCount,
      milestones: view.nodes.length,
      providers: s.providerCount,
      facilities: s.facilityCount,
      span: fmtSpan(s.dateSpan.start, s.dateSpan.end),
      spanShort:
        start && end
          ? `'${String(start.getFullYear()).slice(2)}–'${String(end.getFullYear()).slice(2)}`
          : '—',
      real: s.pdfBreakdown.real,
      total: s.encounterCount,
    },
    // The "read this in 20 seconds" block at the top of the dashboard.
    verdict: {
      headline: courtroom.headline,
      chips: [
        { n: p.newRegions.length, label: p.newRegions.length === 1 ? 'new injury' : 'new injuries', fg: '#ffb3ac', bg: 'rgba(217,45,45,0.32)' },
        { n: p.aggravatedRegions.length, label: 'aggravated', fg: '#ffd479', bg: 'rgba(199,122,0,0.30)' },
        { n: p.preExistingRegions.length, label: 'pre-existing', fg: '#cfd4e2', bg: 'rgba(255,255,255,0.10)' },
        { n: p.surgeries, label: p.surgeries === 1 ? 'surgery' : 'surgeries', fg: '#bcd0ff', bg: 'rgba(120,86,255,0.30)' },
        { n: p.gaps, label: p.gaps === 1 ? 'record gap' : 'record gaps', fg: '#cfd4e2', bg: 'rgba(255,255,255,0.10)' },
      ].filter((c) => c.n > 0),
    },
    nodes,
    gaps,
    comparison,
    courtroom,
    heatmap,
    builder: {
      attorney: PRESET_ATTORNEY,
      narrative: isSample ? SAMPLE_NARRATIVE : '',
      isSample,
    },
    presentation: {
      shape,
      shapeLabel: SHAPE_LABELS[shape],
      shapeBlurb: SHAPE_BLURB[shape],
      rationale: isSample ? SAMPLE_RATIONALE : '',
      slides,
      isSample,
    },
  };
}

/** Identity of the bundled sample, so analyze() knows when captions apply. */
const sampleCaseId = buildSampleCase().id;

declare global {
  interface Window {
    CP: {
      analyze: typeof analyze;
      sample: () => ReturnType<typeof analyze>;
      ingest: (buf: ArrayBuffer, fileName: string) => ReturnType<typeof analyze>;
      XLSX: typeof XLSX;
    };
  }
}

window.CP = {
  analyze,
  sample: () => analyze(buildSampleCase()),
  ingest: (buf: ArrayBuffer, fileName: string) => analyze(ingestWorkbook(buf, fileName)),
  XLSX,
};
