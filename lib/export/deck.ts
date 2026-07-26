/**
 * Jury-deck exports.
 *
 * Both formats render the same deterministic slide data. Nothing is invented at
 * export time — if a number is on the slide it came from the record.
 *
 * PowerPoint uses pptxgenjs (dynamically imported so it never lands in the
 * initial bundle). PDF goes through the browser's own print-to-PDF, which
 * avoids a second rendering engine that could drift from what is on screen.
 */

import type { DeckMeta, GlossaryEntry, PresentationResponse, Slide } from '../ai';

const INK = '1F2333';
const ACCENT = '7856FF';
const MUTED = '6B7280';

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'case'
  );
}

/** Flatten a slide's data into lines a slide can show without any styling. */
function bodyLines(slide: Slide): string[] {
  const d = (slide.data ?? {}) as Record<string, unknown>;
  switch (slide.template) {
    case 'title': {
      const t = d as { subtitle?: string; incidentDate?: string };
      return [t.subtitle ?? '', t.incidentDate ? `Date of loss ${t.incidentDate}` : ''].filter(Boolean);
    }
    case 'stat_compare':
      return ((d.rows as { label: string; before: number; after: number }[]) ?? []).map(
        (r) => `${r.label}:  ${r.before} before  →  ${r.after} after`,
      );
    case 'region_grid':
    case 'body_diagram':
      return ((d.regions as { label: string; verdict?: string; after?: number }[]) ?? []).map(
        (r) => `${r.label}${r.verdict ? ` — ${r.verdict.toLowerCase()}` : ''}`,
      );
    case 'timeline':
      return ((d.events as { date: string; label: string; note: string }[]) ?? []).map(
        (e) => `${e.date}   ${e.label}${e.note ? ` — ${e.note}` : ''}`,
      );
    case 'stat_row':
      return ((d.kpis as { value: string; label: string }[]) ?? []).map((k) => `${k.value}   ${k.label}`);
    case 'quote_records':
      return ((d.records as { date: string; label: string }[]) ?? []).map((r) => `${r.date}   ${r.label}`);
    case 'glossary':
      return ((d.entries as GlossaryEntry[]) ?? []).map((g) => `${g.term} — ${g.plain}`);
    default:
      return [];
  }
}

export async function downloadPptx(res: PresentationResponse, meta: DeckMeta): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = meta.caseName;

  for (const [i, s] of res.slides.entries()) {
    const slide = pptx.addSlide();

    slide.addText(s.heading, {
      x: 0.5,
      y: 0.35,
      w: 9,
      h: 0.7,
      fontSize: i === 0 ? 30 : 24,
      bold: true,
      color: INK,
    });

    const lines = bodyLines(s);
    if (lines.length) {
      slide.addText(lines.map((t) => ({ text: t, options: { breakLine: true } })), {
        x: 0.6,
        y: 1.25,
        w: 8.8,
        h: 3,
        fontSize: 15,
        color: INK,
        lineSpacingMultiple: 1.35,
      });
    }

    if (s.plain) {
      slide.addText(s.plain, {
        x: 0.6,
        y: 4.3,
        w: 8.8,
        h: 0.5,
        fontSize: 12,
        italic: true,
        color: MUTED,
      });
    }

    if (s.caption) {
      slide.addText(s.caption, {
        x: 0.5,
        y: 4.75,
        w: 9,
        h: 0.6,
        fontSize: 14,
        bold: true,
        color: ACCENT,
      });
    }

    slide.addText('Demonstrative aid — not evidence. Every figure traces to a produced record.', {
      x: 0.5,
      y: 5.3,
      w: 9,
      h: 0.3,
      fontSize: 9,
      color: MUTED,
    });
  }

  await pptx.writeFile({ fileName: `${slug(meta.caseName)}-jury-deck.pptx` });
}

/**
 * Print-to-PDF. The deck is already laid out for print by `@media print` in
 * globals.css, so the saved PDF matches the screen instead of a re-render.
 */
export function downloadPdf(): void {
  window.print();
}
