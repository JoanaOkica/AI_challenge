/**
 * "Generate comparison file" — the Defense Simulator's one-pager.
 *
 * A single PNG a lawyer can drop into a case file, an email to co-counsel, or a
 * settlement folder: the exposure split across the top, then every argument the
 * case will face beside the record's answer.
 *
 * Rendered on a canvas rather than through a print stylesheet because the
 * output is an image people paste into other documents, and because it must
 * look identical regardless of the viewer's theme or browser chrome. Nothing is
 * invented at export time — every string comes from `buildCourtroom`.
 */

import type { CourtroomAnalysis } from '../courtroom';

const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const MONO = 'ui-monospace,Menlo,Consolas,monospace';

const INK = '#1F2333';
const MUTED = '#6B7280';
const RULE = '#E3E8F0';
const DEFENSE = '#C0392B';
const PLAINTIFF = '#1F8A5B';
const ACCENT = '#7856FF';

const WIDTH = 1000;
const PAD = 44;
const COL_GAP = 30;
const LINE = 21;

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'case'
  );
}

/** Greedy word wrap against the canvas's own metrics. */
function wrap(ctx: CanvasRenderingContext2D, text: string, font: string, maxWidth: number): string[] {
  ctx.font = font;
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const STRENGTH_LABEL: Record<string, string> = {
  strong: 'FAVORS YOU',
  even: 'CONTESTED',
  uphill: 'CONCEDE / UPHILL',
};

const STRENGTH_COLOR: Record<string, string> = {
  strong: PLAINTIFF,
  even: '#C77A00',
  uphill: MUTED,
};

/**
 * Render the analysis to a PNG blob.
 *
 * Height is measured in a first pass so long arguments are never clipped —
 * canvases cannot grow after allocation.
 */
export function renderComparisonPng(
  analysis: CourtroomAnalysis,
  caseName: string,
  tZeroLabel: string | null,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const measure = canvas.getContext('2d');
  if (!measure) throw new Error('Canvas is unavailable in this browser.');

  const colWidth = (WIDTH - PAD * 2 - COL_GAP) / 2;
  const bodyFont = `15px ${SANS}`;

  // ---- pass 1: height ----
  const headline = wrap(measure, analysis.headline, `14px ${SANS}`, WIDTH - PAD * 2);
  let height = PAD + 64 + 26 + 24 + headline.length * 19 + 18;
  const citeFont = `11px ${MONO}`;
  const blocks = analysis.args.map((a) => {
    const defense = wrap(measure, a.defense, bodyFont, colWidth);
    const response = wrap(measure, a.response, bodyFont, colWidth);
    const rows = Math.max(defense.length, response.length);
    // Citations wrap too — measuring only the first line silently truncated
    // the rest, dropping Bates numbers off the end of the page.
    const cites = a.support.length
      ? wrap(
          measure,
          a.support.map((s) => `${s.date} ${s.recordType}${s.bates ? ` ${s.bates}` : ''}`).join('  ·  '),
          citeFont,
          colWidth,
        )
      : [];
    const h = 22 + 16 + rows * LINE + (cites.length ? 10 + cites.length * 15 : 0) + 22;
    height += h;
    return { a, defense, response, rows, cites };
  });
  height += 30;

  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');

  // ---- pass 2: paint ----
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, WIDTH, 8);

  ctx.fillStyle = INK;
  ctx.font = `700 24px ${SANS}`;
  ctx.fillText(`Courtroom challenge — ${caseName}`, PAD, PAD + 22);

  ctx.fillStyle = MUTED;
  ctx.font = `12px ${SANS}`;
  ctx.fillText(
    `Demonstrative aid — not evidence · derived from produced records${tZeroLabel ? ` · T-Zero ${tZeroLabel}` : ''}`,
    PAD,
    PAD + 42,
  );

  // Exposure bar: how much of the case is new vs. conceded.
  const p = analysis.posture;
  const segments: [number, string, string][] = [
    [p.newRegions.length, DEFENSE, 'New'],
    [p.aggravatedRegions.length, '#C77A00', 'Aggravated'],
    [p.preExistingRegions.length, '#8A95A7', 'Pre-existing'],
  ];
  const total = Math.max(1, segments.reduce((sum, s) => sum + s[0], 0));
  const barY = PAD + 64;
  const barW = WIDTH - PAD * 2;
  let barX = PAD;
  for (const [count, color, label] of segments) {
    const w = (count / total) * barW;
    if (w <= 0) continue;
    ctx.fillStyle = color;
    ctx.fillRect(barX, barY, w, 26);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 12px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${count} ${label}`, barX + w / 2, barY + 17);
    ctx.textAlign = 'left';
    barX += w;
  }

  ctx.fillStyle = MUTED;
  ctx.font = `14px ${SANS}`;
  headline.forEach((line, i) => ctx.fillText(line, PAD, barY + 26 + 24 + i * 19));

  let y = barY + 26 + 24 + headline.length * 19 + 18;
  const rightX = PAD + colWidth + COL_GAP;

  for (const { a, defense, response, rows, cites } of blocks) {
    ctx.fillStyle = INK;
    ctx.font = `700 15px ${SANS}`;
    ctx.fillText(a.theme, PAD, y + 4);

    const label = STRENGTH_LABEL[a.strength] ?? a.strength.toUpperCase();
    ctx.fillStyle = STRENGTH_COLOR[a.strength] ?? MUTED;
    ctx.font = `700 10px ${SANS}`;
    ctx.textAlign = 'right';
    ctx.fillText(label, WIDTH - PAD, y + 4);
    ctx.textAlign = 'left';
    y += 22;

    ctx.font = `700 10px ${SANS}`;
    ctx.fillStyle = DEFENSE;
    ctx.fillText('DEFENSE WILL ARGUE', PAD, y);
    ctx.fillStyle = PLAINTIFF;
    ctx.fillText('YOUR DATA-BACKED RESPONSE', rightX, y);
    y += 16;

    ctx.font = bodyFont;
    ctx.fillStyle = '#33404F';
    for (let i = 0; i < rows; i++) {
      if (defense[i]) ctx.fillText(defense[i], PAD, y + i * LINE);
      if (response[i]) ctx.fillText(response[i], rightX, y + i * LINE);
    }
    y += rows * LINE;

    if (cites.length) {
      ctx.fillStyle = MUTED;
      ctx.font = citeFont;
      cites.forEach((line, i) => ctx.fillText(line, rightX, y + 12 + i * 15));
      y += 10 + cites.length * 15;
    }

    ctx.strokeStyle = RULE;
    ctx.beginPath();
    ctx.moveTo(PAD, y + 10);
    ctx.lineTo(WIDTH - PAD, y + 10);
    ctx.stroke();
    y += 22;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the image.'));
    }, 'image/png');
  });
}

/** Render and hand the file to the browser. */
export async function downloadComparison(
  analysis: CourtroomAnalysis,
  caseName: string,
  tZeroLabel: string | null,
): Promise<void> {
  const blob = await renderComparisonPng(analysis, caseName, tZeroLabel);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(caseName)}-courtroom-comparison.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
