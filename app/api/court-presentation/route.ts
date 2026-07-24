import { NextResponse } from 'next/server';
import type { CaseShape, PresentationInput, PresentationResponse } from '@/lib/ai';
import { buildSlideSpecs, attachCaptions } from '@/lib/presentation';
import { CLAUDE_MODEL, MissingKeyError, createMessage, textOf, extractJson } from '@/lib/server/claude';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHAPES: CaseShape[] = ['before_after', 'escalation_arc', 'persistence', 'multi_trauma'];

const CLASSIFY_SYSTEM = `You are a trial consultant deciding how to SHAPE a personal-injury case for a jury. Choose exactly ONE of four story shapes that best fits the record, and explain why in one or two sentences a trial lawyer would nod at.

The four shapes:
- before_after: a healthy or near-healthy baseline, then a sharp break at the incident. Best when new injuries dominate and there is little pre-existing history.
- escalation_arc: injuries that deepened over time — complaint, then imaging, then surgery. Best when the record shows a worsening trajectory culminating in a procedure.
- persistence: pain that never resolved, continuing to permanency/MMI. Best when treatment is long and ends in a permanency finding.
- multi_trauma: one event, many body regions hurt at once. Best when several distinct regions are injured simultaneously.

Return ONLY JSON: {"shape": "<one of the four>", "rationale": "<1-2 sentences>"}.`;

function classifyPrompt(input: PresentationInput): string {
  return [
    `CASE: ${input.caseName}`,
    `SUMMARY: ${input.headline}`,
    `Body regions (before/after/verdict): ${input.regions
      .map((r) => `${r.label} ${r.before}->${r.after} [${r.verdict}]`)
      .join('; ') || 'none coded'}`,
    `Surgeries: ${input.kpis.surgeries}; imaging: ${input.kpis.imaging}; regions hurt: ${input.kpis.regions}; MMI/permanency: ${input.kpis.mmi ? 'yes' : 'no'}; longest record gap: ${input.kpis.gapDays} days`,
    `Key events: ${input.events.map((e) => `${e.date} ${e.label}`).join('; ') || 'none'}`,
    `Objective proof: ${input.objective.map((o) => `${o.date} ${o.label}`).join('; ') || 'none'}`,
  ].join('\n');
}

const CAPTION_SYSTEM = `You write the on-screen captions for courtroom trial slides. Your ONLY job is the caption text.

Rules:
- Reading age 12. Short, plain words. No legal or medical jargon (say "neck" not "cervical spine", "scan" not "MRI" unless already plain).
- One or two short sentences per caption, 20 words max.
- Say what the slide's numbers MEAN for the injured person — do not restate the numbers.
- Calm and factual. Never exaggerate, never argue, never address the jury directly.
- Use only what each slide provides; invent nothing.

Return ONLY JSON: {"captions": {"<slideId>": "<caption>", ...}} covering every slide id given.`;

function captionPrompt(specs: { id: string; heading: string; data: unknown }[]): string {
  return [
    'Write one caption per slide below. Keys are the slide ids.',
    '',
    ...specs.map((s) => `SLIDE ${s.id} — "${s.heading}"\n  data: ${JSON.stringify(s.data)}`),
  ].join('\n');
}

export async function POST(req: Request) {
  let input: PresentationInput;
  try {
    input = (await req.json()) as PresentationInput;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!input.regions?.length && !input.events?.length) {
    return NextResponse.json(
      { error: 'Not enough case data to build a presentation. Set a T-Zero anchor and load a chronology.' },
      { status: 400 },
    );
  }

  try {
    // ---- Step 1: LLM classifier assigns one of four shapes + rationale ----
    const classifyMsg = await createMessage({
      system: CLASSIFY_SYSTEM,
      user: classifyPrompt(input),
      maxTokens: 1000,
    });
    const parsed = extractJson<{ shape: string; rationale: string }>(textOf(classifyMsg));
    const shape: CaseShape = SHAPES.includes(parsed.shape as CaseShape)
      ? (parsed.shape as CaseShape)
      : 'before_after';
    const rationale = parsed.rationale?.trim() || 'Selected from the record shape.';

    // ---- Fixed templates render from real data (deterministic) ----
    const specs = buildSlideSpecs(shape, input);

    // ---- Step 2: LLM writes only the jury-facing captions ----
    const captionMsg = await createMessage({
      system: CAPTION_SYSTEM,
      user: captionPrompt(specs),
      maxTokens: 1500,
    });
    let captions: Record<string, string> = {};
    try {
      captions = extractJson<{ captions: Record<string, string> }>(textOf(captionMsg)).captions ?? {};
    } catch {
      captions = {};
    }

    const slides = attachCaptions(specs, captions);
    const res: PresentationResponse = { shape, rationale, slides, model: CLAUDE_MODEL };
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof MissingKeyError) {
      return NextResponse.json(
        { error: 'Server is missing ANTHROPIC_API_KEY. Set it and restart to enable the presentation builder.' },
        { status: 503 },
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error contacting Claude.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
