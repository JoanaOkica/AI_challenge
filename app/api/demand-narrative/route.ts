import { NextResponse } from 'next/server';
import type { DemandRequest, DemandResponse, EncounterLite } from '@/lib/ai';
import { CLAUDE_MODEL, MissingKeyError, createMessage, textOf } from '@/lib/server/claude';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM = `You are a senior personal-injury attorney drafting the MEDICAL NARRATIVE section of a demand letter to an insurance adjuster. You write only the medical-chronology prose — no salutation, no damages figures, no legal argument beyond causation.

Hard rules:
1. EVERY sentence must cite the encounter date it relies on, written exactly as the date given for that encounter (MM/DD/YY). A sentence with no date citation is not allowed. Put the date at the start of the sentence ("On 03/10/24, ...") or clearly inside it.
2. Use ONLY facts contained in the provided encounters. Never invent findings, providers, diagnoses, or dates. If a detail is not in the record, do not state it.
3. Move in chronological order. Group related same-day encounters into one sentence when natural, but still cite the date.
4. Plain, confident, factual tone. Third person, referring to the client by name. No bullet points — flowing paragraphs.
5. Name the objective proof (imaging, operative reports, IME) explicitly, since it corroborates the subjective complaints.
6. Where the record shows a pre-existing region, frame it honestly as aggravation, not new injury.

Return ONLY the narrative prose. No headings, no preamble, no closing.`;

function encounterBlock(e: EncounterLite): string {
  const parts = [
    `- ${e.date} | ${e.category} | ${e.recordType}`,
    `  provider: ${e.provider || '—'}; facility: ${e.facility || '—'}`,
    e.regions.length ? `  body regions: ${e.regions.join(', ')}` : '',
    `  record says: ${e.summary || '—'}`,
  ];
  return parts.filter(Boolean).join('\n');
}

export async function POST(req: Request) {
  let body: DemandRequest;
  try {
    body = (await req.json()) as DemandRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { attorney, encounters, posture, headline } = body;
  if (!encounters?.length) {
    return NextResponse.json(
      { error: 'No encounters in the filtered chronology. Widen your filters and try again.' },
      { status: 400 },
    );
  }

  const dated = encounters
    .filter((e) => e.dateISO)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  const user = [
    `CLIENT: ${attorney.clientName || '(the plaintiff)'}`,
    `DEFENDANT: ${attorney.defendant || '(the defendant)'}`,
    `INCIDENT: ${attorney.incidentDate || '(date of loss)'} — ${attorney.incidentDescription || '(mechanism of injury not specified)'}`,
    attorney.jurisdiction ? `JURISDICTION: ${attorney.jurisdiction}` : '',
    attorney.emphasis ? `ATTORNEY EMPHASIS: ${attorney.emphasis}` : '',
    '',
    `CASE POSTURE (for framing, not for citation):`,
    `- New post-incident regions: ${posture.newRegions.join(', ') || 'none'}`,
    `- Aggravated pre-existing regions: ${posture.aggravatedRegions.join(', ') || 'none'}`,
    `- Pre-existing-only regions: ${posture.preExistingRegions.join(', ') || 'none'}`,
    `- Surgeries: ${posture.surgeries}; imaging studies: ${posture.imaging}; IMEs: ${posture.imes}; MMI reached: ${posture.mmi ? 'yes' : 'no'}`,
    headline ? `- One-line summary: ${headline}` : '',
    '',
    `ENCOUNTERS (chronological — cite these dates exactly):`,
    ...dated.map(encounterBlock),
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const message = await createMessage({ system: SYSTEM, user, maxTokens: 4000 });
    const narrative = textOf(message);
    if (!narrative) {
      return NextResponse.json({ error: 'The model returned an empty narrative.' }, { status: 502 });
    }
    const res: DemandResponse = { narrative, model: CLAUDE_MODEL };
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof MissingKeyError) {
      return NextResponse.json(
        { error: 'Server is missing ANTHROPIC_API_KEY. Set it and restart to enable drafting.' },
        { status: 503 },
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error contacting Claude.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
