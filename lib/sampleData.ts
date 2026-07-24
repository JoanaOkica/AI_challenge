/**
 * A synthetic sample chronology so the portal is explorable without uploading
 * a real workbook. It deliberately exercises the hard cases: cooldown thinning
 * (two imaging studies inside 21 days), always-tier events, an MMI force-keep,
 * a pre-existing-vs-new causation split around T-Zero, a null-date row, and
 * a null-body-parts row. Clearly labelled SAMPLE — not real records.
 */

import { sha256Hex } from './hash';
import { classifyPdf } from './pdf';
import { parseDate, fmtDateISO } from './format';
import { normalizeBodyParts } from './bodyMap';
import { computeStats } from './ingest';
import type { CaseData, SourceRow, Bates } from './types';

interface Raw {
  date: string | null;
  provider: string;
  facility: string;
  bodyParts: string;
  medicineType: string;
  recordType: string;
  summary: string;
  pdf: string | null;
  bates?: Bates;
}

const REAL = (id: string) => `https://drive.google.com/file/d/${id}/view?usp=sharing`;
const PLACEHOLDER = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

const RAW: Raw[] = [
  {
    date: '02/10/2023',
    provider: 'Dr. Alan Pierce',
    facility: 'Ridgeline Occupational Health',
    bodyParts: 'Back, Hypertension',
    medicineType: 'Occupational',
    recordType: 'Annual Physical',
    summary:
      'Routine CDL physical. Chronic low back pain reported, longstanding. Blood pressure elevated at 148/94; hypertension noted.',
    pdf: PLACEHOLDER('Ridgeline Occupational Health CDL physical'),
    bates: { begin: 'RID-000001', end: 'RID-000004' },
  },
  {
    date: '01/15/2024',
    provider: 'Metro EMS',
    facility: 'Metro County EMS',
    bodyParts: 'Neck, Head, Left Knee',
    medicineType: 'Emergency',
    recordType: 'EMS Run Report',
    summary:
      'Ambulance run report following motor vehicle collision. Patient restrained driver, airbag deployment. Complaints of neck pain, scalp laceration, left knee pain.',
    pdf: REAL('1a2b3c4d5e6f7g8h9i0j-EMS'),
    bates: { begin: 'EMS-000010', end: 'EMS-000013' },
  },
  {
    date: '01/15/2024',
    provider: 'Dr. Renee Okafor',
    facility: 'St. Vincent Emergency Department',
    bodyParts: 'Neck, Head, Left Knee, Chest',
    medicineType: 'Emergency',
    recordType: 'Emergency Department Triage',
    summary:
      'Emergency room evaluation post MVC. Cervical strain, scalp laceration repaired, left knee contusion, chest wall pain. Imaging ordered.',
    pdf: REAL('2b3c4d5e6f7g8h9i0j1k-ER'),
    bates: { begin: 'SVH-000020', end: 'SVH-000031' },
  },
  {
    date: '01/18/2024',
    provider: 'Dr. Harold Vance',
    facility: 'St. Vincent Radiology',
    bodyParts: 'Cervical, Lumbar',
    medicineType: 'Radiology',
    recordType: 'MRI Report',
    summary:
      'MRI cervical and lumbar spine. Disc herniation at C5-C6 with impingement. Lumbar degenerative disc disease, appears chronic.',
    pdf: REAL('3c4d5e6f7g8h9i0j1k2l-MRI'),
    bates: { begin: 'SVH-000045', end: 'SVH-000048' },
  },
  {
    date: '01/20/2024',
    provider: 'Dr. Harold Vance',
    facility: 'St. Vincent Radiology',
    bodyParts: 'Head',
    medicineType: 'Radiology',
    recordType: 'CT Report',
    summary: 'CT head without contrast. Negative for acute intracranial findings.',
    pdf: REAL('4d5e6f7g8h9i0j1k2l3m-CT'),
  },
  {
    date: '02/05/2024',
    provider: 'Dr. Renee Okafor',
    facility: 'St. Vincent Orthopedics',
    bodyParts: 'Neck, Left Knee',
    medicineType: 'Orthopedics',
    recordType: 'Office Visit',
    summary:
      'Follow-up visit. History of MVC on 1/15/2024 restated. Persistent neck and left knee pain. Conservative management continued.',
    pdf: PLACEHOLDER('St Vincent Orthopedics office visit note'),
  },
  {
    date: '02/20/2024',
    provider: 'Dr. Harold Vance',
    facility: 'St. Vincent Radiology',
    bodyParts: 'Left Knee',
    medicineType: 'Radiology',
    recordType: 'MRI Report',
    summary: 'MRI left knee demonstrates a tear of the medial meniscus. Surgical consultation advised.',
    pdf: REAL('5e6f7g8h9i0j1k2l3m4n-MRI2'),
  },
  {
    date: '03/10/2024',
    provider: 'Dr. Priya Nair',
    facility: 'St. Vincent Surgical Center',
    bodyParts: 'Left Knee, Meniscus',
    medicineType: 'Orthopedic Surgery',
    recordType: 'Operative Report',
    summary: 'Left knee arthroscopy with partial medial meniscectomy. No complications.',
    pdf: REAL('6f7g8h9i0j1k2l3m4n5o-OP'),
    bates: { begin: 'SVH-000120', end: 'SVH-000128' },
  },
  {
    date: '03/12/2024',
    provider: 'Dr. Priya Nair',
    facility: 'St. Vincent Surgical Center',
    bodyParts: 'Left Knee',
    medicineType: 'Orthopedic Surgery',
    recordType: 'Discharge Summary',
    summary: 'Discharged post-operative day two. Wound clean, neurovascularly intact. PT referral.',
    pdf: REAL('7g8h9i0j1k2l3m4n5o6p-DC'),
  },
  {
    date: '04/01/2024',
    provider: 'Dr. Priya Nair',
    facility: 'St. Vincent Orthopedics',
    bodyParts: 'Left Knee, Neck',
    medicineType: 'Orthopedics',
    recordType: 'Work Ability Form',
    summary: 'Work restriction issued: no lifting over 10 pounds, sedentary duty only for 6 weeks.',
    pdf: PLACEHOLDER('work ability form sedentary restriction'),
  },
  {
    date: '05/15/2024',
    provider: 'Grace Tolliver, PT',
    facility: 'Ridgeline Physical Therapy',
    bodyParts: 'Neck, Left Knee',
    medicineType: 'Physical Therapy',
    recordType: 'Physical Therapy Note',
    summary: 'Physical therapy session 8 of 12. History of MVC restated. Improving range of motion.',
    pdf: PLACEHOLDER('physical therapy progress note'),
  },
  {
    date: '06/20/2024',
    provider: 'Dr. Priya Nair',
    facility: 'St. Vincent Orthopedics',
    bodyParts: 'Neck',
    medicineType: 'Orthopedics',
    recordType: 'Work Status Note',
    summary: 'Continued modified duty restrictions. Reassess in 8 weeks.',
    pdf: PLACEHOLDER('work status note modified duty'),
  },
  {
    date: '08/10/2024',
    provider: 'Dr. Marcus Feld',
    facility: 'Independent Medical Evaluations LLC',
    bodyParts: 'Neck, Left Knee, Lumbar',
    medicineType: 'IME',
    recordType: 'Independent Medical Examination',
    summary:
      'Independent medical examination. Opines cervical disc injury and left knee meniscal tear are causally related to the 1/15/2024 collision. Lumbar degeneration deemed pre-existing.',
    pdf: REAL('8h9i0j1k2l3m4n5o6p7q-IME'),
    bates: { begin: 'IME-000001', end: 'IME-000019' },
  },
  {
    date: '09/05/2024',
    provider: 'Dr. Harold Vance',
    facility: 'St. Vincent Radiology',
    bodyParts: 'Lumbar',
    medicineType: 'Radiology',
    recordType: 'X-Ray Report',
    summary: 'Lumbar spine radiographs. Multilevel degenerative changes, chronic in appearance.',
    pdf: REAL('9i0j1k2l3m4n5o6p7q8r-XR'),
  },
  {
    date: '11/01/2024',
    provider: 'Dr. Renee Okafor',
    facility: 'St. Vincent Orthopedics',
    bodyParts: 'Neck',
    medicineType: 'Orthopedics',
    recordType: 'Office Visit',
    summary:
      'Patient has reached maximum medical improvement (MMI) for the cervical spine. Permanent partial impairment assigned.',
    pdf: PLACEHOLDER('MMI determination cervical spine'),
  },
  {
    date: '12/15/2024',
    provider: 'Court Reporter',
    facility: 'Delgado v. Ridgeline Freight',
    bodyParts: '',
    medicineType: 'Legal',
    recordType: 'Deposition',
    summary: 'Deposition transcript of plaintiff regarding the 1/15/2024 collision and course of treatment.',
    pdf: REAL('0j1k2l3m4n5o6p7q8r9s-DEPO'),
    bates: { begin: 'LEG-000001', end: 'LEG-000212' },
  },
  {
    date: null,
    provider: 'Ridgeline Billing',
    facility: 'Ridgeline Freight',
    bodyParts: '',
    medicineType: 'Billing',
    recordType: 'Records Request',
    summary: 'Billing records request. Service date illegible on source document.',
    pdf: null,
  },
  {
    date: '01/20/2025',
    provider: 'Dr. Priya Nair',
    facility: 'St. Vincent Orthopedics',
    bodyParts: 'Neck',
    medicineType: 'Orthopedics',
    recordType: 'Work Ability Form',
    summary: 'Released to full duty without restriction.',
    pdf: PLACEHOLDER('work ability form full duty release'),
  },
];

function buildRow(raw: Raw, index: number): SourceRow {
  const encounterDate = parseDate(raw.date);
  const bodyParts = normalizeBodyParts(raw.bodyParts, raw.summary);
  const regions = [...new Set(bodyParts.map((b) => b.region))];
  const pdf = classifyPdf(raw.pdf);
  const canonicalDate = encounterDate ? fmtDateISO(encounterDate) : (raw.date ?? '');
  const rowId = sha256Hex(
    `${canonicalDate}|${raw.provider}|${raw.facility}|${raw.recordType}|${raw.summary.slice(0, 200)}`,
  );
  return {
    rowId,
    sheetRow: index + 1,
    encounterDate,
    encounterDateRaw: raw.date ?? '',
    provider: raw.provider,
    facility: raw.facility,
    medicineType: raw.medicineType,
    recordType: raw.recordType,
    summary: raw.summary,
    bodyPartsRaw: raw.bodyParts,
    bodyParts,
    regions,
    pdf,
    bates: raw.bates,
  };
}

export function buildSampleCase(): CaseData {
  const rows = RAW.map(buildRow);
  return {
    id: 'sample-delgado-v-ridgeline',
    name: 'SAMPLE — Delgado v. Ridgeline',
    fileName: 'sample-delgado-v-ridgeline.xlsx',
    ingestedAt: Date.now(),
    rows,
    stats: computeStats(rows),
    warnings: [
      'This is a synthetic sample chronology for demonstration — not real medical records.',
    ],
  };
}
