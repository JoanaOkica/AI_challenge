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
import PptxGenJS from 'pptxgenjs';

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

  /* ---- Flat record list ----------------------------------------------
     The searchable table and every heatmap filter read from this. Each row
     carries its own figure zones, so filtering the list is enough to
     recompute the heatmap — the page never re-derives anatomy itself. */
  const DAYMS = 86_400_000;
  const records = view.allRows
    .filter((r) => !r.suppressed)
    .map((r) => {
      const zones = new Set<Zone>();
      for (const part of r.bodyParts) for (const z of partToZones(part)) zones.add(z);
      const cat = classify(r.recordType);
      return {
        rowId: r.rowId,
        dateISO: r.encounterDate ? fmtDateISO(r.encounterDate) : '',
        date: r.encounterDate ? fmtDateShort(r.encounterDate) : '—',
        dateFull: r.encounterDate ? fmtDate(r.encounterDate) : 'Undated',
        sort: r.encounterDate ? +r.encounterDate : Number.MAX_SAFE_INTEGER,
        category: cat?.category ?? 'ENCOUNTER',
        recordType: r.recordType,
        provider: r.provider,
        facility: r.facility,
        specialty: r.medicineType,
        regions: [...new Set(r.bodyParts.map((p) => partLabel(p.id) + (p.laterality ? ' ' + p.laterality[0].toUpperCase() : '')))],
        zones: [...zones],
        summary: r.summary,
        bates: r.bates?.begin ? r.bates.begin + (r.bates.end ? '–' + r.bates.end : '') : '',
        pdf: { kind: r.pdf.kind, href: r.pdf.href },
        isTZero: !!(view.tZeroDate && r.encounterDate && +r.encounterDate === +view.tZeroDate && cat?.category === 'EMS'),
        // Negative = before the incident; drives the phase filter.
        daysFromTZero:
          view.tZeroDate && r.encounterDate
            ? Math.round((+r.encounterDate - +view.tZeroDate) / DAYMS)
            : null,
      };
    })
    .sort((a, b) => a.sort - b.sort);

  const specialties = [...new Set(records.map((r) => r.specialty).filter(Boolean))].sort();

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
    zoneLabels: ZONE_LABELS,
    allZones: ALL_ZONES,
    // Exposed so the page can re-bucket counts after a filter changes.
    flagColors: FLAG_COLOR,
  };

  const p = courtroom.posture;
  const start = s.dateSpan.start;
  const end = s.dateSpan.end;

  /* ---- Case readiness: the things a lawyer acts on, not record counts ----
     The hero above already states the posture and the headline totals, so
     this strip deliberately answers different questions: how fast did the
     client seek care, where is the defense's opening, what corroborates the
     complaints, is the case ripe to demand, and what still has to be chased. */
  const dated = view.allRows.filter((r) => !r.suppressed && r.encounterDate);
  const DAY = 86_400_000;
  const tz = view.tZeroDate;

  const firstAfter = tz
    ? dated.filter((r) => +r.encounterDate! >= +tz).sort((a, b) => +a.encounterDate! - +b.encounterDate!)[0]
    : null;
  const daysToCare = tz && firstAfter ? Math.round((+firstAfter.encounterDate! - +tz) / DAY) : null;

  const lastDate = dated.length
    ? dated.reduce((m, r) => (+r.encounterDate! > +m ? r.encounterDate! : m), dated[0].encounterDate!)
    : null;
  const treatMonths = tz && lastDate ? Math.max(0, Math.round((+lastDate - +tz) / DAY / 30.44)) : null;

  // Only gaps that open *after* the incident are an attack surface. The quiet
  // stretch before T-Zero is a healthy baseline — it helps the plaintiff, and
  // flagging it as a treatment gap would invert its meaning.
  const worstGap = view.gaps
    .filter((g) => !tz || +g.start >= +tz)
    .reduce<{ days: number; start: Date } | null>(
      (m, g) => (!m || g.days > m.days ? { days: g.days, start: g.start } : m),
      null,
    );

  const mmiRow = dated.find((r) => /maximum medical improvement|\bMMI\b/i.test(r.summary ?? ''));
  const undocumented = view.allRows.filter((r) => !r.suppressed && r.pdf.kind !== 'real').length;
  const objective = p.imaging + p.surgeries + p.imes;

  // tone: 'good' reads as strength, 'warn' as something to handle, 'flat' neutral.
  const readiness = [
    daysToCare == null
      ? { v: '—', l: 'Time to first care', sub: 'no T-Zero anchor', tone: 'flat' }
      : {
          v: daysToCare === 0 ? 'Same day' : daysToCare + (daysToCare === 1 ? ' day' : ' days'),
          l: 'Time to first care',
          sub: daysToCare <= 2 ? 'undercuts a delay defense' : 'defense may argue delay',
          tone: daysToCare <= 2 ? 'good' : 'warn',
        },
    {
      v: treatMonths == null ? '—' : treatMonths + ' mo',
      l: 'Treatment duration',
      sub: 'from the incident to the last record',
      tone: 'flat',
    },
    worstGap
      ? {
          v: worstGap.days + 'd',
          l: 'Longest treatment gap',
          sub: 'opens ' + fmtDateShort(worstGap.start) + ' — expect the attack here',
          tone: 'warn',
        }
      : { v: 'None', l: 'Longest treatment gap', sub: 'continuous treatment on record', tone: 'good' },
    {
      v: String(objective),
      l: 'Objective proof',
      sub: [p.imaging + ' imaging', p.surgeries + ' surgical', p.imes + ' IME'].join(' · '),
      tone: objective > 0 ? 'good' : 'warn',
    },
    {
      v: mmiRow ? fmtDateShort(mmiRow.encounterDate!) : 'Not yet',
      l: 'MMI / permanency',
      sub: mmiRow ? 'case is ripe to demand' : 'damages not yet fixed',
      tone: mmiRow ? 'good' : 'warn',
    },
    {
      v: String(undocumented),
      l: 'Records to chase',
      sub: undocumented ? 'encounters with no document produced' : 'every encounter has a document',
      tone: undocumented ? 'warn' : 'good',
    },
  ];

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
    readiness,
    records,
    specialties,
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

type Analysis = ReturnType<typeof analyze>;

/* ------------------------------------------------------------------ *
 * PowerPoint export                                                    *
 * ------------------------------------------------------------------ */

const INK = '1C2432';
const MUTED = '5A6577';
const ACCENT = '3B4B8C';
const RULE = 'D9DFEA';
const DEFENSE = 'C0392B';
const WARN = 'C77A00';
const PLAINTIFF = '1F8A5B';

const VERDICT_COLOR: Record<string, string> = {
  'NEW POST-INCIDENT': DEFENSE,
  'PRE-EXISTING, AGGRAVATED': WARN,
  'PRE-EXISTING ONLY': MUTED,
};

/**
 * Build a presentation deck from the analysis — a real .pptx the lawyer can
 * open in PowerPoint or Keynote and walk a jury, a colleague, or a client
 * through. Every figure comes from the record; nothing here is invented.
 *
 * Returns the file as an ArrayBuffer so the caller decides how to deliver it.
 */
async function buildDeck(a: Analysis): Promise<ArrayBuffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';           // 10 x 5.625 in
  pptx.title = a.caseName;
  pptx.author = 'Medical Chronology & Body Timeline Portal';

  const W = 10;
  const M = 0.55;                         // page margin
  const CW = W - M * 2;                   // content width

  /** Every slide gets the same header rule and the not-evidence footer. */
  const slide = (heading?: string) => {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };
    if (heading) {
      s.addText(heading, {
        x: M, y: 0.34, w: CW, h: 0.42,
        fontSize: 23, bold: true, color: INK, fontFace: 'Arial',
      });
      s.addShape(pptx.ShapeType.rect, { x: M, y: 0.84, w: CW, h: 0.02, fill: { color: RULE } });
    }
    s.addText('Demonstrative aid — not evidence · every figure traces to a produced record', {
      x: M, y: 5.16, w: CW, h: 0.26, fontSize: 9, color: MUTED, fontFace: 'Arial',
    });
    return s;
  };

  /* ---- 1. Cover ---- */
  const cover = pptx.addSlide();
  cover.background = { color: '20263C' };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.1, fill: { color: '6474C8' } });
  cover.addText(a.caseName, {
    x: M, y: 1.5, w: CW, h: 0.9, fontSize: 34, bold: true, color: 'FFFFFF', fontFace: 'Arial',
  });
  cover.addText(a.verdict.headline, {
    x: M, y: 2.45, w: CW, h: 1.1, fontSize: 16, color: 'CFD4E2', fontFace: 'Arial',
  });
  if (a.tzero) {
    cover.addText('Date of loss  ' + a.tzero.label, {
      x: M, y: 3.7, w: CW, h: 0.3, fontSize: 12, bold: true, color: '98A6FF', fontFace: 'Arial',
    });
  }
  cover.addText('Demonstrative aid — not evidence', {
    x: M, y: 5.05, w: CW, h: 0.3, fontSize: 10, color: '8A95A7', fontFace: 'Arial',
  });

  /* ---- 2. The case in one look ---- */
  const s2 = slide('The case in one look');
  const tiles: [string, string][] = [
    [String(a.stats.encounters), 'Medical visits'],
    [String(a.courtroom.posture.surgeries), a.courtroom.posture.surgeries === 1 ? 'Surgery' : 'Surgeries'],
    [String(a.courtroom.posture.imaging), 'Scans & imaging'],
    [String(a.verdict.chips.find((c) => /new injur/.test(c.label))?.n ?? 0), 'New injuries'],
  ];
  tiles.forEach(([v, l], i) => {
    const x = M + i * (CW / 4);
    s2.addText(v, { x, y: 1.25, w: CW / 4 - 0.15, h: 0.75, fontSize: 40, bold: true, color: ACCENT, fontFace: 'Arial' });
    s2.addText(l, { x, y: 2.02, w: CW / 4 - 0.15, h: 0.3, fontSize: 11, color: MUTED, fontFace: 'Arial' });
  });
  s2.addText(
    a.readiness.map((r) => ({
      text: r.v + ' — ' + r.l.toLowerCase() + '. ' + r.sub + '\n',
      options: { fontSize: 12, color: r.tone === 'warn' ? WARN : r.tone === 'good' ? PLAINTIFF : INK, bullet: true },
    })),
    { x: M, y: 2.6, w: CW, h: 2.3, fontFace: 'Arial', lineSpacingMultiple: 1.3 },
  );

  /* ---- 3. Story of the injury ---- */
  if (a.nodes.length) {
    const s3 = slide('The story, in order');
    const picks = a.nodes.filter((n) => n.category !== 'ENCOUNTER').slice(0, 9);
    const rows = (picks.length ? picks : a.nodes.slice(0, 9)).map((n) => [
      { text: n.dateLabel, options: { bold: true, color: ACCENT, fontSize: 12 } },
      { text: n.rows[0] ? n.rows[0].recordType : n.category, options: { fontSize: 12, color: INK } },
      { text: n.parts.map((p) => p.label).join(', ') || '—', options: { fontSize: 11, color: MUTED } },
    ]);
    s3.addTable(rows, {
      x: M, y: 1.05, w: CW, colW: [1.3, 3.6, 3.99],
      border: { type: 'solid', color: RULE, pt: 0.5 },
      rowH: 0.36, valign: 'middle', fontFace: 'Arial',
    });
  }

  /* ---- 4. Before vs after ---- */
  if (a.comparison.length) {
    const s4 = slide('Before the incident vs. after');
    const head = ['Body region', 'Before', 'After', 'Finding'].map((t) => ({
      text: t,
      options: { bold: true, fontSize: 11, color: 'FFFFFF', fill: { color: ACCENT } },
    }));
    const body = a.comparison.slice(0, 9).map((c) => [
      { text: c.label + (c.laterality ? ' (' + c.laterality + ')' : ''), options: { fontSize: 12, color: INK } },
      { text: String(c.before), options: { fontSize: 12, color: MUTED, align: 'center' as const } },
      { text: String(c.after), options: { fontSize: 12, color: INK, bold: true, align: 'center' as const } },
      { text: c.verdict, options: { fontSize: 10, bold: true, color: VERDICT_COLOR[c.verdict] ?? MUTED } },
    ]);
    s4.addTable([head, ...body], {
      x: M, y: 1.05, w: CW, colW: [3.4, 1.1, 1.1, 3.29],
      border: { type: 'solid', color: RULE, pt: 0.5 },
      rowH: 0.34, valign: 'middle', fontFace: 'Arial',
    });
  }

  /* ---- 5. Where the body was hurt ---- */
  // Sorted by count, not anatomical order — the bar scale divides by the
  // busiest region, so the widest bar is exactly the track width.
  const flagged = a.heatmap.zones.filter((z) => z.count > 0).sort((x, y) => y.count - x.count);
  if (flagged.length) {
    const s5 = slide('Where the treatment concentrated');
    const shown = flagged.slice(0, 8);
    const busiest = shown[0].count;
    const TRACK = CW / 2 - 0.75;          // leaves room for the count label
    s5.addText(
      shown.map((z) => ({
        text: z.label + '\n',
        options: { fontSize: 14, color: INK, bullet: { code: '25CF' } },
      })),
      { x: M, y: 1.2, w: CW / 2 - 0.2, h: 3.4, fontFace: 'Arial', lineSpacingMultiple: 1.5 },
    );
    shown.forEach((z, i) => {
      const y = 1.3 + i * 0.42;
      const w = Math.max(0.12, TRACK * (z.count / busiest));
      s5.addShape(pptx.ShapeType.rect, {
        x: W / 2, y, w, h: 0.26,
        fill: { color: z.color.replace('#', '') },
      });
      s5.addText(String(z.count), {
        x: W / 2 + w + 0.08, y: y - 0.02, w: 0.55, h: 0.3,
        fontSize: 11, bold: true, color: MUTED, fontFace: 'Arial',
      });
    });
  }

  /* ---- 6. Proof you can hold ---- */
  const proof = a.nodes
    .flatMap((n) => n.rows.map((r) => ({ date: n.dateLabel, r })))
    .filter((x) => /operative|mri|ct |x-?ray|imaging|independent medical/i.test(x.r.recordType))
    .slice(0, 7);
  if (proof.length) {
    const s6 = slide('Proof you can hold in your hand');
    s6.addText(
      proof.map((x) => ({
        text: x.date + ' — ' + x.r.recordType + (x.r.provider ? ' · ' + x.r.provider : '') + '\n',
        options: { fontSize: 13, color: INK, bullet: true },
      })),
      { x: M, y: 1.2, w: CW, h: 3.4, fontFace: 'Arial', lineSpacingMultiple: 1.5 },
    );
  }

  /* ---- 7+. What the other side will say ---- */
  a.courtroom.args.slice(0, 4).forEach((arg) => {
    const s = slide(arg.theme);
    s.addText('THEY WILL ARGUE', { x: M, y: 1.05, w: CW / 2 - 0.2, h: 0.26, fontSize: 10, bold: true, color: DEFENSE, fontFace: 'Arial' });
    s.addText(arg.defense, { x: M, y: 1.36, w: CW / 2 - 0.2, h: 3.2, fontSize: 13, color: INK, fontFace: 'Arial' });
    s.addText('THE RECORD ANSWERS', { x: W / 2, y: 1.05, w: CW / 2 - 0.2, h: 0.26, fontSize: 10, bold: true, color: PLAINTIFF, fontFace: 'Arial' });
    s.addText(arg.response, { x: W / 2, y: 1.36, w: CW / 2 - 0.2, h: 3.2, fontSize: 13, color: INK, fontFace: 'Arial' });
    s.addShape(pptx.ShapeType.rect, { x: W / 2 - 0.1, y: 1.05, w: 0.012, h: 3.4, fill: { color: RULE } });
  });

  return (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
}

declare global {
  interface Window {
    CP: {
      analyze: typeof analyze;
      sample: () => Analysis;
      ingest: (buf: ArrayBuffer, fileName: string) => Analysis;
      buildDeck: (a: Analysis) => Promise<ArrayBuffer>;
      XLSX: typeof XLSX;
    };
  }
}

window.CP = {
  analyze,
  sample: () => analyze(buildSampleCase()),
  ingest: (buf: ArrayBuffer, fileName: string) => analyze(ingestWorkbook(buf, fileName)),
  buildDeck,
  XLSX,
};
