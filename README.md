# Chronology Portal — a demand-letter machine with a visual cockpit

Turns a medical-record chronology (the Excel schema in PRD v2) into the work a
PI firm actually bills against. The dashboard is the input; the letter and the
courtroom exhibits are the output. Four modules, one shared case:

1. **Injury Dashboard** — the milestone timeline, body map, and pre/post-incident
   causation table. Everything traces back to a source row in one click.
2. **Case Builder** — one button, *Draft demand narrative*, sends the filtered
   chronology + attorney inputs to Google Gemini and returns the medical-narrative
   section of a demand letter, **every sentence citing its encounter date**.
3. **Defense Simulator** — every argument the case will face, each paired with a
   data-backed answer drawn from the record (deterministic; no API needed).
4. **Court Presentation** — a two-step build: an LLM classifier assigns the case
   one of four shapes (`before_after`, `escalation_arc`, `persistence`,
   `multi_trauma`) with a stated rationale, then fixed slide templates render
   from real data while the LLM writes only the jury captions, at reading age 12.

> **Demonstrative aids — not evidence.** Every screen and export carries that
> label. Nothing appears that can't be traced to a produced record. AI-drafted
> text (Case Builder, Court Presentation captions) is attorney work product for
> review, never a filing on its own.

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
npm run test       # engine unit tests
npm run typecheck  # tsc --noEmit
npm run lint       # eslint (flat config; Next 16 removed `next lint`)
npm run build      # next build, then the OpenNext Worker bundle
npm run preview    # build + serve the Worker locally on workerd
npm run deploy     # build + wrangler deploy
```

`build` runs `next build`, and npm's `postbuild` hook then runs
`opennextjs-cloudflare build --skipNextBuild`, which repackages the existing
`.next/standalone` output into `.open-next/worker.js`. Keeping the two as
separate scripts means the app is only compiled once, while any host that knows
nothing but `npm run build` still ends up with a deployable Worker.

### Gemini API setup

The Injury Dashboard and Defense Simulator run entirely in the browser — no
backend, no key. The two AI modules (Case Builder, Court Presentation) call
Gemini through server-side Next.js API routes and need a key:

```bash
export GOOGLE_API_KEY=your-key-here
npm run dev
```

Without the key the app still loads and both AI pages render — pressing their
button returns a clear "server is missing GOOGLE_API_KEY" message instead of a
draft. The routes use `gemini-2.5-flash` (override with `GEMINI_MODEL`). Model
calls live only in `app/api/*/route.ts` and `lib/server/gemini.ts`; the browser
never sees the key.

> **Free-tier privacy.** Google may use free-tier prompts to improve their
> products, including human review. That is fine for the synthetic sample case
> here. Enable billing — or move to a provider that does not train on API data —
> before putting a real client chronology through it.

| Module | Where | Calls Gemini? |
|---|---|---|
| Injury Dashboard | `components/Portal.tsx`, `Timeline`, `SidePanel`, `DataTable` | no |
| Case Builder | `components/CaseBuilder.tsx` → `app/api/demand-narrative/route.ts` | yes (1 call) |
| Defense Simulator | `components/DefenseSimulator.tsx` ← `lib/courtroom.ts` | no |
| Court Presentation | `components/CourtPresentation.tsx` → `app/api/court-presentation/route.ts` | yes (classify + caption) |

Payloads are assembled from the resolved view in `lib/aiBuild.ts`; slide
templates are built deterministically in `lib/presentation.ts` so a jury never
sees a figure the model invented.

---

## Security

The threat model has two untrusted inputs: **the uploaded workbook** (anyone can
send a lawyer a malicious `.xlsx`) and **the public internet** (the AI routes
cost money per call). Controls, and where they live:

| Control | Where | Stops |
|---|---|---|
| `http(s)`-only URL allowlist | `lib/pdf.ts` (`isSafeHttpUrl`) | `javascript:` / `data:` hyperlink targets reaching an `href` or iframe — stored XSS |
| Sandboxed, no-referrer preview iframe | `components/DetailModal.tsx` | An embedded document scripting the portal or navigating the top frame |
| Upload type + 20 MB size cap | `components/Portal.tsx` | ReDoS against the spreadsheet parser |
| Bounded regex alternation | `lib/highlight.ts` | ReDoS from a workbook with thousands of body-part tokens |
| Same-origin check | `lib/server/guard.ts` | Other sites driving your API quota (CSRF / hotlinking) |
| Per-IP token bucket (8/hr) | `lib/server/guard.ts` | One client draining the API budget |
| 512 KB body cap | `lib/server/guard.ts` | Memory-exhaustion DoS |
| Field caps + `safeText()` | both API routes | Prompt injection and unbounded token spend from record text |
| Scrubbed errors | `lib/server/guard.ts` | Upstream SDK internals leaking to the client |
| CSP, `frame-ancestors 'none'`, nosniff, HSTS, no `X-Powered-By` | `next.config.mjs` | Clickjacking, MIME sniffing, framework fingerprinting |
| `Cache-Control: no-store` on `/api/*` | `next.config.mjs` | A proxy caching a generated legal draft |

`npm test` includes 29 security regressions (`lib/__tests__/security.test.ts`)
covering the hostile-URL, prompt-injection, and origin cases.

### Known residual risk

- **`xlsx` 0.18.5** carries prototype-pollution and ReDoS advisories with no fix
  on the npm registry. The pollution path is **not reachable here** — `ingest.ts`
  addresses cells directly and never calls `sheet_to_json`, which is what
  produces `__proto__` keys — and the ReDoS is bounded by the upload cap. To
  clear it fully, install the patched build from the vendor's own CDN (blocked
  from this sandbox, so it was not applied):
  ```bash
  npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
  ```
- **`brace-expansion` / `minimatch`** carry a glob-expansion DoS advisory
  (GHSA-mh99-v99m-4gvg) that reaches ESLint's plugins and, through
  `@node-minify/core`, the OpenNext builder. No patched release exists in the
  1.x or 2.x lines those packages require, and the only versions that carry the
  fix (`brace-expansion@5`, `minimatch@10`) are ESM-shaped: forcing them makes
  `require('minimatch')` return an object instead of a function and breaks every
  consumer. Both are **build-time only** — neither ships in the Worker bundle —
  and the glob patterns come from our own config and build output, never from a
  request. Left in place deliberately; revisit when the upstreams bump.
- **Work product lives in `localStorage`** (notes, stars, T-Zero), unencrypted
  and per browser. That is the PRD's storage choice; on a shared machine it is
  readable by anyone with the profile. Move to a server session store before
  handling real client data.
- **Fonts load from Google's CDN**, which discloses visitor IPs to a third
  party. Self-host the two families before any GDPR-sensitive deployment.

### Before deploying publicly

1. **Never commit `GOOGLE_API_KEY`** — set it as an environment variable in
   the host's dashboard. `.env*` is gitignored.
2. **Rotate the key** if it has ever been pasted into a chat, ticket, or shared
   terminal. Treat any key that left a password manager as burned.
3. The rate limiter is **in-memory and per-instance** — good for a single
   server, but it resets on redeploy and does not coordinate across serverless
   instances. Put a shared store (Upstash/Redis) or the host's WAF rate limiting
   in front of `/api/*` for anything beyond a demo.

### Cloudflare Workers Builds

The Git integration needs exactly two commands, and neither has to change again:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

`wrangler deploy` detects the OpenNext project and hands off to
`opennextjs-cloudflare deploy`, which reads the compiled config from
`.open-next/`. That directory only exists because `postbuild` produced it — a
build command of bare `next build` leaves it empty and the deploy fails with
*"Could not find compiled Open Next config"*.

Set `GOOGLE_API_KEY` as a **secret**, not a plain variable:
`npx wrangler secret put GOOGLE_API_KEY` (or the Workers dashboard →
Settings → Variables and Secrets). Plain variables are readable from the
dashboard and echoed in build logs.

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
