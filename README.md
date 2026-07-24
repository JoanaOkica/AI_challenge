# Medical Chronology & Body Timeline Portal

Turns a medical-record chronology (the Excel schema in PRD v2) into three
demonstrative aids: a **milestone timeline**, a **body map** per node, and a
**pre/post-incident causation table**. Everything on screen traces back to a
source row in one click.

> **Demonstrative aids — not evidence.** Every screen and export carries that
> label. Nothing appears that can't be traced to a produced record.

Built to **PRD v2**. The two verified modules from the spec —
`lib/milestones.ts` and `lib/bodyMap.ts` — are pasted in verbatim.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Then either **drop an `.xlsx` chronology** onto the landing page or click
**Load sample case** to explore with synthetic data. Other scripts:

```bash
npm run test       # 27 unit tests for the engine
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

No backend or environment variables are required — ingestion, normalization,
and storage all run in the browser.

---

## What it does (PRD § → where)

| PRD | Feature | Code |
|---|---|---|
| §2.2 | SheetJS ingest, PDF **hyperlink target** (`cell.l.Target`, not the `"pdf"` text), defensive date parsing | `lib/ingest.ts`, `lib/pdf.ts`, `lib/format.ts` |
| §2.3 | Content-hash row IDs (SHA-256) so notes survive re-export | `lib/hash.ts`, `lib/ingest.ts` |
| §2.4 | Two layers — read-only source vs. work product, separate store, excluded from exports | `lib/types.ts`, `lib/workProduct.ts` |
| §3 | Milestone engine — Record-Type classification, cooldown thinning, force-keeps | `lib/milestones.ts` (verbatim) |
| §3.4 | Granularity toggle — Milestones / All flagged / All encounters | `lib/resolve.ts`, `components/Header.tsx` |
| §4 | Body-part normalization → region + laterality; flat region fill keyed to presence | `lib/bodyMap.ts` (verbatim), `components/BodySilhouette.tsx` |
| §5 | Header, timeline canvas, side panel, detail modal | `components/*` |
| §5.2 | Time-proportional timeline, T-Zero splitter, gap bands ("gap in records produced") | `components/Timeline.tsx`, `lib/gaps.ts` |
| §6 | Pre/post T-Zero comparison with causation verdicts | `lib/tzero.ts`, `components/SidePanel.tsx` |
| §5.3 | Case overview, key events, unassigned drawer (null date / null body) | `components/SidePanel.tsx` |
| §5.4 | Detail modal — Summary keyword highlights, aggregated rows, PDF embed, Bates, work-product note | `components/DetailModal.tsx`, `lib/highlight.ts` |

Follows the §9 build order; all six steps are implemented.

---

## Architecture

```
lib/            pure, framework-free, unit-tested
  ingest.ts       xlsx → SourceRow[] (+ stats, warnings)
  milestones.ts   § verbatim — Record-Type milestone engine
  bodyMap.ts      § verbatim — 34-pattern body-part dictionary
  laterality.ts   ingestion-boundary refinement (see note below)
  tzero.ts        pre/post causation table
  gaps.ts         records-gap detection
  resolve.ts      central selector: source + work product + filters → view
  workProduct.ts  Layer 2 store (localStorage, swappable)
  hash.ts         self-contained SHA-256
components/     React (Next.js App Router, client components)
app/            shell (layout, globals, page → <Portal/>)
```

`resolveView()` is the one place that merges Layer 1, the Layer-2 overlay, and
the UI filters into everything the screen renders — kept pure so it is testable
without React.

---

## Key decisions

- **Layer 2 storage = localStorage**, namespaced and keyed on the content-hash
  `rowId`. The PRD lists IndexedDB or Postgres; the interface in
  `workProduct.ts` is small enough to swap without touching callers. Notes
  survive re-upload of the same file because the key is the content hash, not a
  row index.
- **Self-contained SHA-256** (no Web Crypto / Node `crypto`) so row identity is
  synchronous and byte-identical in the browser and in Node tests.
- **Laterality refinement** (`lib/laterality.ts`). `bodyMap.ts` falls back to
  scanning the whole Summary for a side when a token has none — correct for a
  one-part row, but on a multi-part row it smears a stray "left knee" onto the
  neck and chest. The PRD is explicit that a wrong side is worse than a neutral
  one, so at the ingestion boundary we keep only the laterality a token states
  about *itself* when a cell yields more than one part. `bodyMap.ts` itself is
  left untouched.
- **Body map = region-level flat fill** at fixed opacity (presence, not
  severity). Limbs honour laterality; an unknown side is **hatched**, never
  guessed. Front view only (the front/back toggle is cut per §1).

---

## Acceptance tests (PRD §8)

The five sample workbooks are not included in this repo, so the measured
node-count targets can't be re-run here. Instead the engine behaviour those
numbers depend on is covered by `lib/__tests__/engine.test.ts` (27 tests):
always-tier retention, 21-day imaging cooldown, 90-day work-status cooldown,
first/last/MMI force-keeps, suppression, body-part mapping, PDF classification
(real / placeholder / Drive `/view`→`/preview`), SHA-256 vectors and stability,
and the pre/post verdicts. Drop any of the real workbooks onto the app to check
the counts directly.

## Cut from v1 (per PRD)

Cost / financial exposure · front-back SVG toggle · range-of-motion charts ·
shareable public portal · court-ready PDF export · severity-scaled heatmaps ·
rich-text note editor.
