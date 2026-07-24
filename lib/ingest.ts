/**
 * Ingestion (PRD §2).
 *
 * Reads the immutable Excel schema, extracts the PDF hyperlink *target*
 * (not the cell text "pdf"), assigns content-hash row ids, and normalizes
 * body parts. Nothing here mutates; the result is Layer 1 (read-only).
 */

import * as XLSX from 'xlsx';
import { sha256Hex } from './hash';
import { classifyPdf } from './pdf';
import { parseDate, fmtDateISO, nonEmpty } from './format';
import { normalizeBodyParts, normalizeBodyPart, type Region } from './bodyMap';
import { refineLateralities } from './laterality';
import type { CaseData, CaseStats, PdfKind, SourceRow, Bates } from './types';

/** Canonical schema fields and the header aliases we accept for each. */
type Field =
  | 'encounterDate' | 'provider' | 'facility' | 'bodyParts'
  | 'medicineType' | 'recordType' | 'summary' | 'linkToPdf'
  | 'batesBegin' | 'batesEnd' | 'page' | 'cost';

// Checked in order — specific headers before generic, so "Record Type" and
// "Medicine Type" are never captured by a bare "type".
const FIELD_ALIASES: [Field, string[]][] = [
  ['encounterDate', ['encounter date', 'date of service', 'service date', 'dos', 'encounter dt', 'date']],
  ['provider', ['primary provider', 'provider', 'treating provider', 'physician', 'doctor']],
  ['facility', ['facility', 'facility name', 'location', 'clinic', 'hospital', 'provider facility']],
  ['bodyParts', ['body parts', 'body part', 'body region', 'anatomy', 'bodypart']],
  ['medicineType', ['medicine type', 'medication type', 'specialty', 'medicine']],
  ['recordType', ['record type', 'document type', 'record category', 'recordtype']],
  ['summary', ['summary', 'summary of records', 'description', 'note', 'notes']],
  ['linkToPdf', ['link to pdf', 'link to file', 'link', 'pdf', 'document link', 'exhibit', 'source']],
  ['batesBegin', ['bates begin', 'bates start', 'beginning bates', 'bates begin no', 'bates']],
  ['batesEnd', ['bates end', 'ending bates', 'bates end no']],
  ['page', ['page', 'page no', 'pg', 'page number']],
  ['cost', ['cost', 'amount', 'charge', 'billed', 'total cost']],
];

const REQUIRED: Field[] = ['encounterDate', 'recordType', 'summary'];

function normHeader(s: unknown): string {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';
  if (cell.w != null) return String(cell.w).trim();
  if (cell.v == null) return '';
  return String(cell.v).trim();
}

/**
 * Find the header row (first row that matches >= 3 known headers) and map
 * each known field to a column index.
 */
function locateColumns(
  ws: XLSX.WorkSheet,
  range: XLSX.Range,
): { headerRow: number; cols: Partial<Record<Field, number>> } | null {
  for (let r = range.s.r; r <= Math.min(range.s.r + 12, range.e.r); r++) {
    const cols: Partial<Record<Field, number>> = {};
    const used = new Set<Field>();
    for (let c = range.s.c; c <= range.e.c; c++) {
      const h = normHeader(cellText(ws[XLSX.utils.encode_cell({ r, c })]));
      if (!h) continue;
      for (const [field, aliases] of FIELD_ALIASES) {
        if (used.has(field) || cols[field] != null) continue;
        if (aliases.includes(h)) {
          cols[field] = c;
          used.add(field);
          break;
        }
      }
    }
    const hits = Object.keys(cols).length;
    if (hits >= 3 && REQUIRED.every((f) => cols[f] != null)) {
      return { headerRow: r, cols };
    }
  }
  return null;
}

function caseIdFromName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'case';
}

function caseNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export interface IngestResult {
  case: CaseData;
}

export function ingestWorkbook(buf: ArrayBuffer, fileName: string): CaseData {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const warnings: string[] = [];

  if (!ws || !ws['!ref']) {
    return emptyCase(fileName, ['Sheet is empty or unreadable.']);
  }

  const range = XLSX.utils.decode_range(ws['!ref']);
  const located = locateColumns(ws, range);
  if (!located) {
    return emptyCase(fileName, [
      'Could not find the expected header row. Required columns: Encounter Date, Record Type, Summary.',
    ]);
  }
  const { headerRow, cols } = located;

  const rows: SourceRow[] = [];
  const unmappedTokens = new Set<string>();

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const get = (f: Field): XLSX.CellObject | undefined =>
      cols[f] != null ? ws[XLSX.utils.encode_cell({ r, c: cols[f]! })] : undefined;

    const encounterCell = get('encounterDate');
    const provider = cellText(get('provider'));
    const facility = cellText(get('facility'));
    const bodyPartsRaw = cellText(get('bodyParts'));
    const medicineType = cellText(get('medicineType'));
    const recordType = cellText(get('recordType'));
    const summary = cellText(get('summary'));
    const batesBegin = cellText(get('batesBegin'));
    const batesEnd = cellText(get('batesEnd'));
    const page = cellText(get('page'));
    const cost = cellText(get('cost'));

    // Skip a completely blank line.
    if (![provider, facility, bodyPartsRaw, medicineType, recordType, summary].some(nonEmpty) &&
        !encounterCell) {
      continue;
    }

    const encounterDateRaw =
      encounterCell?.v instanceof Date ? '' : cellText(encounterCell);
    const encounterDate = parseDate(encounterCell?.v ?? encounterCell?.w);

    // PDF: the URI lives on the cell hyperlink target, NOT the value ("pdf").
    const pdfCell = get('linkToPdf');
    const pdf = classifyPdf(pdfCell?.l?.Target ?? null);

    const bodyParts = refineLateralities(normalizeBodyParts(bodyPartsRaw, summary));
    const regions = uniqueRegions(bodyParts.map((b) => b.region));

    // Track any body-part token that failed to map (acceptance test: 0 unmapped).
    for (const tok of bodyPartsRaw.split(',')) {
      const t = tok.trim();
      if (t && !normalizeBodyPart(t, summary)) unmappedTokens.add(t);
    }

    const bates: Bates | undefined =
      batesBegin || batesEnd || page ? { begin: batesBegin, end: batesEnd, page } : undefined;

    const canonicalDate = encounterDate ? fmtDateISO(encounterDate) : encounterDateRaw;
    const rowId = sha256Hex(
      `${canonicalDate}|${provider}|${facility}|${recordType}|${summary.slice(0, 200)}`,
    );

    rows.push({
      rowId,
      sheetRow: r,
      encounterDate,
      encounterDateRaw: encounterDateRaw || (encounterDate ? fmtDateISO(encounterDate) : ''),
      provider,
      facility,
      medicineType,
      recordType,
      summary,
      bodyPartsRaw,
      bodyParts,
      regions,
      pdf,
      bates,
      cost: cost || undefined,
    });
  }

  // De-dup identical content-hash rows (defensive; keeps rowId a true key).
  const deduped = dedupeByRowId(rows);
  if (deduped.length !== rows.length) {
    warnings.push(`${rows.length - deduped.length} duplicate row(s) collapsed by content hash.`);
  }

  const stats = computeStats(deduped);
  if (stats.nullDateCount > 0) {
    warnings.push(`${stats.nullDateCount} row(s) had no parseable date — see the Unassigned drawer.`);
  }
  if (unmappedTokens.size > 0) {
    warnings.push(
      `${unmappedTokens.size} body-part token(s) did not map: ${[...unmappedTokens].slice(0, 8).join(', ')}${unmappedTokens.size > 8 ? '…' : ''}`,
    );
  }

  return {
    id: caseIdFromName(fileName),
    name: caseNameFromFile(fileName),
    fileName,
    ingestedAt: Date.now(),
    rows: deduped,
    stats,
    warnings,
  };
}

function uniqueRegions(regions: Region[]): Region[] {
  return [...new Set(regions)];
}

function dedupeByRowId(rows: SourceRow[]): SourceRow[] {
  const seen = new Set<string>();
  const out: SourceRow[] = [];
  for (const row of rows) {
    if (seen.has(row.rowId)) continue;
    seen.add(row.rowId);
    out.push(row);
  }
  return out;
}

export function computeStats(rows: SourceRow[]): CaseStats {
  const providers = new Set<string>();
  const facilities = new Set<string>();
  const recordTypes = new Map<string, number>();
  const pdfBreakdown: Record<PdfKind, number> = { real: 0, placeholder: 0, none: 0 };
  let nullDateCount = 0;
  let nullBodyPartCount = 0;
  let start: Date | null = null;
  let end: Date | null = null;

  for (const row of rows) {
    if (nonEmpty(row.provider)) providers.add(row.provider);
    if (nonEmpty(row.facility)) facilities.add(row.facility);
    const rt = row.recordType || '(untyped)';
    recordTypes.set(rt, (recordTypes.get(rt) ?? 0) + 1);
    pdfBreakdown[row.pdf.kind]++;
    if (!row.encounterDate) nullDateCount++;
    else {
      if (!start || row.encounterDate < start) start = row.encounterDate;
      if (!end || row.encounterDate > end) end = row.encounterDate;
    }
    if (row.bodyParts.length === 0) nullBodyPartCount++;
  }

  const recordTypeBreakdown = [...recordTypes.entries()]
    .map(([recordType, count]) => ({ recordType, count }))
    .sort((a, b) => b.count - a.count);

  return {
    encounterCount: rows.length,
    dateSpan: { start, end },
    providerCount: providers.size,
    facilityCount: facilities.size,
    recordTypeBreakdown,
    nullDateCount,
    nullBodyPartCount,
    pdfBreakdown,
  };
}

function emptyCase(fileName: string, warnings: string[]): CaseData {
  return {
    id: caseIdFromName(fileName),
    name: caseNameFromFile(fileName),
    fileName,
    ingestedAt: Date.now(),
    rows: [],
    stats: {
      encounterCount: 0,
      dateSpan: { start: null, end: null },
      providerCount: 0,
      facilityCount: 0,
      recordTypeBreakdown: [],
      nullDateCount: 0,
      nullBodyPartCount: 0,
      pdfBreakdown: { real: 0, placeholder: 0, none: 0 },
    },
    warnings,
  };
}
