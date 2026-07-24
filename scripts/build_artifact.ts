/**
 * Builds the self-contained Case Portal artifact.
 *
 * Runs the tested engine (milestones, body map, T-Zero comparison, courtroom
 * analysis) against the sample case, serializes the result, and injects it
 * into `artifact-template.html`, producing a single self-contained page that
 * needs no server and no API key.
 *
 *   npm run artifact
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildSampleCase } from '../lib/sampleData';
import { resolveView, EMPTY_FILTERS } from '../lib/resolve';
import { buildCourtroom } from '../lib/courtroom';
import { emptyWorkProduct } from '../lib/types';
import { DEFAULT_GAP_DAYS } from '../lib/gaps';
import { fmtDate, fmtDateShort, fmtDateISO, fmtSpan } from '../lib/format';
import { partLabel } from '../lib/labels';
import { classify } from '../lib/milestones';
import type { NormalizedBodyPart } from '../lib/bodyMap';
import type { TimelineNode } from '../lib/resolve';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Map a normalized body part to the SVG zones it lights up (front / back figure). */
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

function main() {
  const caseData = buildSampleCase();

  // Anchor T-Zero on the EMS run report (the incident-day record).
  const ems = caseData.rows.find((r) => classify(r.recordType)?.category === 'EMS');
  const wp = emptyWorkProduct();
  if (ems) wp.tZeroRowId = ems.rowId;

  const view = resolveView(caseData, wp, 'milestones', EMPTY_FILTERS, DEFAULT_GAP_DAYS);
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
        pdf: { kind: r.pdf.kind, href: r.pdf.href },
      })),
    };
  });

  const gaps = view.gaps.map((g) => {
    // The node after which this gap sits = the last node on gap.start's date.
    const before = [...nodes].reverse().find((n) => n.dateISO === fmtDateISO(g.start));
    return { days: g.days, startLabel: fmtDateShort(g.start), endLabel: fmtDateShort(g.end), afterNodeId: before?.id ?? null };
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

  const data = {
    caseName: caseData.name,
    disclaimer: caseData.warnings[0] ?? '',
    tzero: view.tZeroDate ? { iso: fmtDateISO(view.tZeroDate), label: fmtDateShort(view.tZeroDate) } : null,
    stats: {
      encounters: s.encounterCount,
      providers: s.providerCount,
      facilities: s.facilityCount,
      span: fmtSpan(s.dateSpan.start, s.dateSpan.end),
      real: s.pdfBreakdown.real,
      total: s.encounterCount,
    },
    nodes,
    gaps,
    comparison,
    courtroom,
  };

  const template = readFileSync(join(__dirname, 'artifact-template.html'), 'utf8');
  const html = template.replace('"__CASE_DATA__"', JSON.stringify(data));

  const outDir = join(__dirname, '..', 'artifact');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'case-portal.html');
  writeFileSync(outFile, html, 'utf8');
  console.log('Wrote ' + outFile + ' (' + Math.round(html.length / 1024) + ' KB)');
  console.log('Nodes: ' + nodes.length + ' · Comparison rows: ' + comparison.length + ' · Arguments: ' + courtroom.args.length);
}

main();
