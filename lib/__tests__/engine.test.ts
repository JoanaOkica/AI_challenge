import { describe, it, expect } from 'vitest';
import { buildMilestones, classify, type ChronologyRow } from '../milestones';
import { classifyPdf, toEmbedUrl } from '../pdf';
import { parseDate, fmtDateISO } from '../format';
import { sha256Hex } from '../hash';
import { buildComparison } from '../tzero';
import { refineLateralities } from '../laterality';
import { normalizeBodyPart, normalizeBodyParts } from '../bodyMap';
import { buildCourtroom } from '../courtroom';
import { buildSampleCase } from '../sampleData';
import type { SourceRow } from '../types';

const d = (s: string) => parseDate(s)!;

function row(partial: Partial<ChronologyRow> & { rowId: string }): ChronologyRow {
  return {
    encounterDate: null,
    recordType: '',
    summary: '',
    ...partial,
  };
}

describe('sha256Hex', () => {
  it('matches known FIPS test vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('is stable for the same content (row identity survives re-upload)', () => {
    const key = '2024-01-15|Metro EMS|Metro County EMS|EMS Run Report|Ambulance run report';
    expect(sha256Hex(key)).toBe(sha256Hex(key));
    expect(sha256Hex(key)).toHaveLength(64);
  });
});

describe('parseDate', () => {
  it('parses MM/DD/YYYY', () => {
    expect(fmtDateISO(parseDate('01/15/2024'))).toBe('2024-01-15');
  });
  it('accepts Date objects and Excel serials', () => {
    expect(fmtDateISO(parseDate(new Date(2024, 0, 15)))).toBe('2024-01-15');
    expect(fmtDateISO(parseDate(45306))).toBe('2024-01-15'); // Excel serial for 2024-01-15
  });
  it('returns null for junk instead of throwing', () => {
    expect(parseDate('illegible')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe('classify (Record Type only)', () => {
  it('flags always-tier categories', () => {
    expect(classify('Operative Report')?.category).toBe('SURGERY');
    expect(classify('EMS Run Report')?.category).toBe('EMS');
    expect(classify('Emergency Department Triage')?.category).toBe('ER');
    expect(classify('Discharge Summary')?.category).toBe('DISCHARGE');
    expect(classify('Independent Medical Examination')?.category).toBe('IME');
    expect(classify('Deposition')?.category).toBe('LEGAL');
  });
  it('catches CT Report / MRI Report as imaging', () => {
    expect(classify('CT Report')?.category).toBe('IMAGING');
    expect(classify('MRI Report')?.category).toBe('IMAGING');
    expect(classify('X-Ray Report')?.category).toBe('IMAGING');
  });
  it('does not flag ordinary office visits', () => {
    expect(classify('Office Visit')).toBeNull();
    expect(classify('Physical Therapy Note')).toBeNull();
  });
});

describe('buildMilestones', () => {
  it('keeps always-tier categories even on the same day', () => {
    const rows = [
      row({ rowId: 'a', encounterDate: d('01/15/2024'), recordType: 'EMS Run Report' }),
      row({ rowId: 'b', encounterDate: d('01/15/2024'), recordType: 'Emergency Department Triage' }),
    ];
    const nodes = buildMilestones(rows);
    const cats = nodes.map((n) => n.category).sort();
    expect(cats).toContain('EMS');
    expect(cats).toContain('ER');
  });

  it('thins imaging within the 21-day cooldown but keeps the later one', () => {
    const rows = [
      row({ rowId: 'i1', encounterDate: d('01/18/2024'), recordType: 'MRI Report' }),
      row({ rowId: 'i2', encounterDate: d('01/20/2024'), recordType: 'CT Report' }), // 2 days -> dropped
      row({ rowId: 'i3', encounterDate: d('02/20/2024'), recordType: 'MRI Report' }), // 33 days -> kept
    ];
    const imaging = buildMilestones(rows).filter((n) => n.category === 'IMAGING');
    expect(imaging).toHaveLength(2);
    expect(fmtDateISO(imaging[0].date)).toBe('2024-01-18');
    expect(fmtDateISO(imaging[1].date)).toBe('2024-02-20');
  });

  it('thins work-status within the 90-day cooldown', () => {
    const rows = [
      row({ rowId: 'w1', encounterDate: d('04/01/2024'), recordType: 'Work Ability Form' }),
      row({ rowId: 'w2', encounterDate: d('06/20/2024'), recordType: 'Work Status Note' }), // 80 days -> dropped
      row({ rowId: 'w3', encounterDate: d('01/20/2025'), recordType: 'Work Ability Form' }), // kept
    ];
    const work = buildMilestones(rows).filter((n) => n.category === 'WORKSTATUS');
    expect(work).toHaveLength(2);
  });

  it('force-keeps first record, last record, and first MMI', () => {
    const rows = [
      row({ rowId: 'f', encounterDate: d('02/10/2023'), recordType: 'Annual Physical' }),
      row({ rowId: 'mmi', encounterDate: d('11/01/2024'), recordType: 'Office Visit', summary: 'reached maximum medical improvement' }),
      row({ rowId: 'l', encounterDate: d('01/20/2025'), recordType: 'Office Visit' }),
    ];
    const nodes = buildMilestones(rows);
    const reasons = nodes.map((n) => n.reason);
    expect(reasons).toContain('first-record');
    expect(reasons).toContain('last-record');
    expect(reasons).toContain('first-mmi');
  });

  it('respects suppression', () => {
    const rows = [
      row({ rowId: 'a', encounterDate: d('03/10/2024'), recordType: 'Operative Report', suppressed: true }),
      row({ rowId: 'b', encounterDate: d('03/12/2024'), recordType: 'Discharge Summary' }),
    ];
    const nodes = buildMilestones(rows);
    expect(nodes.some((n) => n.rows.some((r) => r.rowId === 'a'))).toBe(false);
  });
});

describe('normalizeBodyPart', () => {
  it('maps tokens to regions', () => {
    expect(normalizeBodyPart('Neck')?.region).toBe('NECK');
    expect(normalizeBodyPart('Left Knee')?.region).toBe('LOWER_EXT');
    expect(normalizeBodyPart('Hypertension')?.region).toBe('SYSTEMIC');
    expect(normalizeBodyPart('Lumbar')?.id).toBe('spine_lumbar');
  });
  it('extracts laterality from the token, else the summary, else null', () => {
    expect(normalizeBodyPart('Left Knee')?.laterality).toBe('left');
    expect(normalizeBodyPart('Knee', 'patient reports right knee pain')?.laterality).toBe('right');
    expect(normalizeBodyPart('Knee')?.laterality).toBeNull();
  });
  it('de-duplicates within a comma-separated cell', () => {
    const parts = normalizeBodyParts('Neck, Cervical, Neck');
    expect(parts).toHaveLength(1);
  });
});

describe('refineLateralities', () => {
  it('does not smear one summary side across other parts of a multi-part row', () => {
    const parts = refineLateralities(
      normalizeBodyParts('Neck, Head, Left Knee, Chest', 'left knee contusion post MVC'),
    );
    const byId = new Map(parts.map((p) => [p.id, p]));
    expect(byId.get('knee')?.laterality).toBe('left'); // token stated its own side
    expect(byId.get('neck_cervical')?.laterality).toBeNull();
    expect(byId.get('head')?.laterality).toBeNull();
    expect(byId.get('chest')?.laterality).toBeNull();
  });
  it('keeps the summary fallback for a single-part row', () => {
    const parts = refineLateralities(normalizeBodyParts('Knee', 'right knee pain'));
    expect(parts[0].laterality).toBe('right');
  });
});

describe('classifyPdf', () => {
  it('flags google search targets as placeholders', () => {
    const p = classifyPdf('https://www.google.com/search?q=some+record');
    expect(p.kind).toBe('placeholder');
    expect(p.embedHref).toBeNull();
  });
  it('classes missing targets as none', () => {
    expect(classifyPdf(null).kind).toBe('none');
    expect(classifyPdf('').kind).toBe('none');
  });
  it('classes real drive links and rewrites /view to /preview', () => {
    const p = classifyPdf('https://drive.google.com/file/d/ABC123/view?usp=sharing');
    expect(p.kind).toBe('real');
    expect(p.embedHref).toBe('https://drive.google.com/file/d/ABC123/preview');
  });
  it('embeds drive open?id= links', () => {
    expect(toEmbedUrl('https://drive.google.com/open?id=XYZ')).toBe(
      'https://drive.google.com/file/d/XYZ/preview',
    );
  });
});

describe('buildComparison (pre/post T-Zero)', () => {
  const rows = buildSampleCase().rows as SourceRow[];
  const tZero = d('01/15/2024');

  it('classes cervical/knee as NEW POST-INCIDENT and lumbar as aggravated', () => {
    const cmp = buildComparison(rows, tZero);
    const byId = new Map(cmp.map((c) => [c.partId, c]));
    expect(byId.get('neck_cervical')?.verdict).toBe('NEW POST-INCIDENT');
    expect(byId.get('knee')?.verdict).toBe('NEW POST-INCIDENT');
    expect(byId.get('spine_lumbar')?.verdict).toBe('PRE-EXISTING, AGGRAVATED');
  });

  it('classes an only-before finding as PRE-EXISTING ONLY', () => {
    const cmp = buildComparison(rows, tZero);
    const htn = cmp.find((c) => c.partId === 'chest_systemic');
    expect(htn?.verdict).toBe('PRE-EXISTING ONLY');
  });

  it('returns nothing without a T-Zero anchor', () => {
    expect(buildComparison(rows, null)).toHaveLength(0);
  });
});

describe('buildCourtroom', () => {
  const rows = buildSampleCase().rows as SourceRow[];
  const tZero = d('01/15/2024');

  it('produces causation, aggravation, concession, gap, objective and permanency arguments', () => {
    const a = buildCourtroom(rows, tZero);
    const themes = a.args.map((x) => x.id);
    expect(themes).toContain('causation-new');
    expect(themes.some((t) => t.startsWith('aggravation-'))).toBe(true);
    expect(themes).toContain('concede-preexisting');
    expect(themes.some((t) => t.startsWith('gap-'))).toBe(true);
    expect(themes).toContain('objective-findings');
    expect(themes).toContain('permanency-mmi');
  });

  it('ranks strong arguments before uphill ones', () => {
    const a = buildCourtroom(rows, tZero);
    const firstUphill = a.args.findIndex((x) => x.strength === 'uphill');
    const lastStrong = a.args.map((x) => x.strength).lastIndexOf('strong');
    if (firstUphill >= 0) expect(lastStrong).toBeLessThan(firstUphill);
  });

  it('captures posture counts from the data', () => {
    const { posture } = buildCourtroom(rows, tZero);
    expect(posture.surgeries).toBe(1);
    expect(posture.mmi).toBe(true);
    expect(posture.newRegions.length).toBeGreaterThanOrEqual(3);
    expect(posture.preExistingRegions).toContain('Cardiovascular');
  });

  it('returns no arguments-from-comparison without a T-Zero', () => {
    const a = buildCourtroom(rows, null);
    expect(a.args.every((x) => !x.id.startsWith('causation'))).toBe(true);
  });
});

describe('sample case sanity', () => {
  it('has a null-date row and a null-body-parts row for the drawer', () => {
    const c = buildSampleCase();
    expect(c.rows.some((r) => !r.encounterDate)).toBe(true);
    expect(c.rows.some((r) => r.encounterDate && r.bodyParts.length === 0)).toBe(true);
  });
  it('classifies PDFs into real and placeholder', () => {
    const c = buildSampleCase();
    expect(c.stats.pdfBreakdown.real).toBeGreaterThan(0);
    expect(c.stats.pdfBreakdown.placeholder).toBeGreaterThan(0);
  });
});
