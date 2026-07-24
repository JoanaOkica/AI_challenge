/**
 * Deterministic slide-template builder for the Court Presentation.
 *
 * The LLM only ever does two things: (1) classify the case into one of four
 * shapes, and (2) write one jury caption per slide. The slides themselves —
 * titles, numbers, ordering — are built here from the real record data, so a
 * jury never sees a figure the model invented.
 */

import type { CaseShape, PresentationInput, Slide, SlideTemplate } from './ai';

interface SlideSpec {
  id: string;
  template: SlideTemplate;
  heading: string;
  data: unknown;
}

/** Which fixed templates each case shape renders, in order. */
const SHAPE_SLIDES: Record<CaseShape, SlideTemplate[]> = {
  before_after: ['title', 'stat_compare', 'region_grid', 'stat_row'],
  escalation_arc: ['title', 'timeline', 'stat_row', 'quote_records'],
  persistence: ['title', 'timeline', 'quote_records', 'stat_row'],
  multi_trauma: ['title', 'region_grid', 'stat_compare', 'quote_records'],
};

function specFor(template: SlideTemplate, input: PresentationInput): SlideSpec {
  switch (template) {
    case 'title':
      return {
        id: 'title',
        template,
        heading: input.caseName,
        data: {
          subtitle: input.headline,
          incidentDate: input.incidentDate,
        },
      };
    case 'stat_compare':
      return {
        id: 'stat_compare',
        template,
        heading: 'Before the crash vs. after the crash',
        data: {
          rows: input.regions.map((r) => ({
            label: r.label,
            before: r.before,
            after: r.after,
            verdict: r.verdict,
          })),
        },
      };
    case 'region_grid':
      return {
        id: 'region_grid',
        template,
        heading: 'Every part of the body that was hurt',
        data: {
          regions: input.regions.map((r) => ({
            label: r.label,
            verdict: r.verdict,
            firstMention: r.firstMention,
          })),
        },
      };
    case 'timeline':
      return {
        id: 'timeline',
        template,
        heading: 'The story, in order',
        data: { events: input.events },
      };
    case 'stat_row':
      return {
        id: 'stat_row',
        template,
        heading: 'The case by the numbers',
        data: {
          kpis: [
            { value: String(input.kpis.encounters), label: 'Medical visits' },
            { value: String(input.kpis.surgeries), label: 'Surgeries' },
            { value: String(input.kpis.imaging), label: 'Scans & imaging' },
            { value: String(input.kpis.regions), label: 'Body regions hurt' },
            ...(input.kpis.mmi ? [{ value: 'Yes', label: 'Permanent injury' }] : []),
          ],
        },
      };
    case 'quote_records':
      return {
        id: 'quote_records',
        template,
        heading: 'Proof you can hold in your hand',
        data: { records: input.objective },
      };
  }
}

/** Build the ordered slide specs (no captions yet) for a chosen shape. */
export function buildSlideSpecs(shape: CaseShape, input: PresentationInput): SlideSpec[] {
  return SHAPE_SLIDES[shape].map((t) => specFor(t, input));
}

/** Merge LLM captions (keyed by slide id) back onto the specs. */
export function attachCaptions(specs: SlideSpec[], captions: Record<string, string>): Slide[] {
  return specs.map((s) => ({ ...s, caption: captions[s.id] ?? '' }));
}
