/**
 * Builds the self-contained Case Portal artifact.
 *
 * esbuild bundles `artifact-engine.ts` — the real ingest, milestone, T-Zero,
 * heatmap and courtroom code, plus SheetJS — into a single IIFE, which is
 * inlined into `artifact-template.html`. The result is one HTML file that
 * needs no server and no API key, yet runs the same tested engine as the app:
 * it parses spreadsheets you drop on it rather than replaying a fixture.
 *
 * The only static parts are the two LLM-backed outputs (demand narrative and
 * jury captions), which a page with no server cannot generate.
 *
 *   npm run artifact
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const tmp = join(__dirname, '.engine.tmp.js');

  await build({
    entryPoints: [join(__dirname, 'artifact-engine.ts')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2019',
    outfile: tmp,
    logLevel: 'warning',
  });

  const engine = readFileSync(tmp, 'utf8');
  rmSync(tmp, { force: true });

  const template = readFileSync(join(__dirname, 'artifact-template.html'), 'utf8');
  if (!template.includes('/*__ENGINE__*/')) {
    throw new Error('artifact-template.html is missing the /*__ENGINE__*/ marker.');
  }
  // Guard against a stray </script> in the bundle closing the inline block early.
  const safe = engine.replace(/<\/script>/gi, '<\\/script>');
  const html = template.replace('/*__ENGINE__*/', () => safe);

  const outDir = join(__dirname, '..', 'artifact');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'case-portal.html');
  writeFileSync(outFile, html, 'utf8');

  console.log('Wrote ' + outFile + ' (' + Math.round(html.length / 1024) + ' KB)');
  console.log('  engine bundle: ' + Math.round(engine.length / 1024) + ' KB (includes SheetJS)');
  console.log('  page shell:    ' + Math.round((html.length - engine.length) / 1024) + ' KB');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
