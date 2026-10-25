# Axion

An Autonomous Knowledge System (formerly "Living Knowledge Base"; the user-facing name for a
knowledge base is now a **knowledge vault** — code, routes, and the database keep the original
`knowledgeBase` naming).

An AI-powered knowledge management MVP that discovers external information, continuously
monitors sources, and proactively surfaces insights for review — for **any** domain
(software, hobbies, business research, etc), not just software development.

Core loop: **Define Goal → Blueprint → Approve → Create KB → Monitor Sources → Detect
Changes → Insights → User Review → Repeat.**

## 1. Quick start

Requirements: Node.js 18.18+ (tested on Node 22), npm.

```bash
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...
npm run db:migrate   # creates prisma/dev.db and applies the schema
npm run dev          # http://localhost:3000
```

Without `ANTHROPIC_API_KEY` set, the app still runs: source fetching, deduplication,
scheduling, and all CRUD/review screens work. Every AI-dependent endpoint (onboarding
questions, blueprint generation, extraction/comparison/insight generation during a
research run) returns a clear `412` error / in-run notice instead of silently faking
results. See `.env.example`.

### Testing

```bash
npm test          # runs prisma migrate deploy against prisma/test.db, then the suite once
npm run test:watch
```

Tests never touch `prisma/dev.db` and never call the real Anthropic API — all Claude
calls are mocked (`@anthropic-ai/sdk` mocked via `vi.mock`), and the one external-network
test (`rss-fetcher.test.ts`) mocks the HTTP layer with a fixed RSS/XML fixture, so the
suite is fully deterministic and offline.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app (also boots the in-process research scheduler) |
| `npm run build` / `npm start` | Production build/start |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Apply Prisma migrations to `prisma/dev.db` |
| `npm run db:studio` | Prisma Studio GUI on `prisma/dev.db` |
| `npm test` | Run the Vitest suite against an isolated `prisma/test.db` |

## 2. Demo walkthrough

1. Go to `/` (Home). Type a goal in the hero prompt, or try one of the four example
   chips (full-stack dev, bubble tea business, freediving, AI research).
2. You land in the full-screen onboarding wizard at `/new` (no sidebar — this is
   deliberately a focused flow, see `docs/frontend-redesign-plan.md`). Step 1 shows up
   to 3 AI-generated questions (skipped automatically if the goal is already specific
   enough). Step 2 is fixed-UI preferences (monitoring cadence, source-type interests,
   free-text notes) — these feed into blueprint generation, they're not just cosmetic.
   Steps 3-4 are the editable blueprint (knowledge structure, then sources). Step 5 is a
   read-only review. **Nothing is persisted until you click "Confirm & create" on step 5.**
3. You land on `/kb/[id]` (Overview), now inside the persistent left sidebar app shell.
   Click **Run Research Now** — this calls the real orchestrator: fetches your approved
   sources over HTTP, deduplicates, and (if `ANTHROPIC_API_KEY` is set) runs extraction →
   comparison → insight generation.
4. Check `/kb/[id]/insights` for generated insights (Save/Dismiss) and any pending
   **knowledge change proposals** (Approve/Reject) — contradictions/replacements never
   auto-apply.
5. Check `/kb/[id]/library` for stored knowledge entries (search + category filter) and
   `/kb/[id]/sources` for per-source health (status, last check, last error).
6. In `/kb/[id]/settings`, switch monitoring to Daily/Weekly/Monthly — the in-process
   scheduler (node-cron) will then run the same orchestrator automatically while the
   server is up (see limitation below).
7. Click **AI Assistant** in the top-right of any KB page to open a right-side chat
   scoped to that knowledge base — answers are grounded only in what's actually stored
   (it says so honestly when the knowledge base doesn't cover something yet).
8. The sidebar's **Search** and **Inbox** nav items work across every knowledge base:
   Search does a cross-KB keyword search over knowledge entries; Inbox aggregates every
   `PENDING` insight and proposal from all KBs into one review queue. **All Knowledge**
   in the sidebar is the full KB grid (what used to be the homepage).

Sources that are guaranteed to actually fetch real content: blueprints include GitHub
Releases sources for any well-known project your goal/categories mention (React, Next.js,
Node, Prisma, Docker, Kubernetes, etc; see `src/lib/research/known-sources.ts`). Hacker News is no longer offered in the wizard's
source step (Step 4). Everything else the AI suggests is marked **"Unverified suggestion"**
because the model can't browse the web to confirm a URL is live — you decide whether to
keep it.

## 3. Architecture overview

```
src/
  app/                    Next.js App Router pages + API route handlers
    new/                   full-screen 5-step onboarding wizard (own left stepper, no
                           app sidebar — goal/questions → preferences → structure →
                           sources → review & create)
    (shell)/               route group: the persistent app shell (sidebar nav)
      page.tsx               Home — hero prompt + aggregate stats + recent activity
      knowledge/             the full knowledge-base grid (sidebar's "All Knowledge")
      search/                cross-KB knowledge entry search
      inbox/                 cross-KB pending insights + proposals queue
      settings/               app-level settings (AI config status, per-KB links)
      kb/[id]/{,library,insights,sources,settings}  per-KB workspace + AI Assistant panel
    api/...                REST endpoints (see §5)
  components/              UI, split by feature area (setup/blueprint/dashboard/insights/
                           library/sources/assistant/ui — ui/ has no Radix, hand-rolled
                           Tailwind + cva primitives, including chip/tag-input/dropdown-
                           menu/drawer/row-item)
  lib/
    ai/        client.ts (Claude wrapper + Structured Outputs), schemas.ts (Zod),
               setup-agent / blueprint-agent / extraction-agent / comparison-agent / insight-agent
    research/  rss-fetcher / github-fetcher / html-fetcher, normalizer, deduplicator,
               ssrf-guard + http (safe fetch: timeouts, retries, size caps, SSRF, robots.txt),
               known-sources + source-discovery (deterministic verified sources),
               orchestrator.ts (the pipeline — see §4)
    knowledge/ repository.ts (reads), comparison.ts (agent glue), versioning.ts (proposal
               create/approve/reject with before/after snapshots)
    jobs/      scheduler.ts (node-cron, in-process)
    db/        prisma.ts (singleton client)
    validation/schemas.ts (API request Zod schemas)
    api/response.ts (consistent {ok,data|error} envelope + error → HTTP status mapping)
prisma/        schema.prisma + migrations
tests/         unit/ + integration/ (Vitest)
```

**Structured outputs.** `generateStructured()` in `src/lib/ai/client.ts` forces Claude to
call a single tool whose `input_schema` is generated from a Zod schema
(`z.toJSONSchema`), then validates the tool call's input against that same Zod schema —
Anthropic's equivalent of OpenAI's Structured Outputs. One retry is attempted with the
validation error fed back to the model before giving up.

**Five AI agents, one client.** Setup, Blueprint, Extraction, Comparison, and Insight
agents are five prompt/schema pairs sharing `generateStructured()` — not five separate
deployments. All of them are domain-agnostic by construction (no hardcoded "software"
assumptions in prompts or schemas); see `src/lib/research/known-sources.ts` for the one
deliberately domain-aware piece (recognizing well-known software project names to suggest
real GitHub repos).

## 4. Research pipeline

`src/lib/research/orchestrator.ts::runResearch(knowledgeBaseId)` is called by both the
manual **"Run Research Now"** button and the scheduler — there is exactly one pipeline
implementation.

1. Refuse to start if a run is already `RUNNING` for this KB (`OverlappingRunError`,
   surfaced as HTTP 409) — prevents overlapping runs.
2. Create a `ResearchRun` row (`RUNNING`), load the KB and its non-paused sources.
3. Per source: fetch via the matching adapter (RSS/GitHub Releases/HTML), each going
   through `safeFetch` (SSRF-guarded, timeout, size-capped, content-type-checked,
   redirect-revalidated) with exponential-backoff retry and an upstream-status check
   (so a 502 error page is never mistaken for valid feed content). Conditional requests
   use the source's stored ETag/Last-Modified. Failures are caught **per source** —
   one bad source never aborts the run — and recorded on the `Source` row
   (`status: ERROR`, `lastError`).
4. Documents are normalized (canonical URL, content hash) and passed through **exact**
   deduplication (by URL and content hash, scoped to the source) before being persisted
   as `SourceDocument` rows. (Semantic/embedding-based dedup is P1 — not implemented;
   see §6.)
5. Up to `MAX_DOCUMENTS_PROCESSED_PER_RUN` (8) new documents go through: Extraction Agent
   → find relevant existing entries (keyword overlap, P1 would use embeddings) →
   Comparison Agent. `DUPLICATE` → skip. `UNRELATED`/`EXTENSION` → auto-create a `DRAFT`
   `KnowledgeEntry` (safe, additive). `CONTRADICTION`/`REPLACEMENT_CANDIDATE` → create a
   `KnowledgeChangeProposal` (`PENDING`) instead of touching existing knowledge.
6. If any findings exist, the Insight Agent ranks them and returns **at most 3** insights
   for the whole run (often zero) — persisted with `InsightEvidence` linking back to the
   source documents that justify them.
7. The run is marked `COMPLETED` (no issues), `PARTIAL` (some sources/AI steps failed or
   were skipped, e.g. missing API key — real data still got stored), or `FAILED` (every
   source failed). The distinction between "a source failed" and "AI was skipped" is
   tracked separately so a missing API key doesn't get reported as every source failing.

### Scheduling

`src/lib/jobs/scheduler.ts` uses `node-cron`, booted once via `src/instrumentation.ts`
(Next.js's server-start hook) and re-synced whenever a KB's `monitoringFrequency`
changes via `PATCH /api/knowledge-bases/:id`.

**Limitation (by design, documented per the brief):** this scheduler only runs while
`npm run dev` / `npm start` is alive — there is no background daemon. Stop the server
and scheduled runs simply don't happen until you restart it. For a real deployment,
replace this with a persistent worker process or a hosted cron trigger (e.g. a
cron-triggered serverless function or a long-running container) that calls the exact
same `runResearch()` orchestrator used here.

## 5. API

All responses are `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "message", "details"? } }`.
Validation is Zod; errors map to standard HTTP status codes (400 validation, 404 not
found, 409 conflicting/overlapping run or duplicate source, 412 AI not configured, 500
unexpected).

| Method | Path | Notes |
|---|---|---|
| POST | `/api/setup/questions` | `{userGoal, previousAnswers?}` → ≤3 dynamic questions |
| POST | `/api/blueprints/generate` | `{userGoal, answers}` → editable blueprint |
| POST | `/api/knowledge-bases` | Creates KB + categories + sources (only on explicit confirm) |
| GET | `/api/knowledge-bases` | List, with counts |
| GET/PATCH | `/api/knowledge-bases/:id` | Detail / update name, description, frequency |
| GET/POST | `/api/knowledge-bases/:id/sources` | List / add a source |
| POST | `/api/knowledge-bases/:id/research` | Runs the orchestrator synchronously, returns the `ResearchRun` |
| GET | `/api/knowledge-bases/:id/research-runs` | History (latest 25) |
| GET | `/api/knowledge-bases/:id/insights` | List, with evidence |
| PATCH | `/api/insights/:id` | `{status: SAVED\|DISMISSED\|PENDING\|ACTIONED}` |
| GET | `/api/knowledge-bases/:id/entries` | `?search=&categoryId=` |
| GET | `/api/knowledge-bases/:id/proposals` | `?status=` |
| POST | `/api/proposals/:id/approve` | Transactional apply + snapshot of the previous version |
| POST | `/api/proposals/:id/reject` | No changes applied |
| GET | `/api/search` | `?q=` — cross-KB keyword search over knowledge entries, powers the sidebar Search page |
| POST | `/api/knowledge-bases/:id/chat` | `{message, history}` → `{reply}` — the AI Assistant panel; retrieval-grounded, ephemeral (history is client-held, nothing persisted server-side) |
| POST | `/api/knowledge-bases/:id/vault/sync` | Manual Markdown vault resync (it already auto-syncs after every mutation — see §5a) |

### 5a. Markdown vault — Obsidian / filesystem-agent access

Every knowledge base also exists as a plain folder of Markdown files under `VAULT_DIR`
(default `./vault`, one subfolder per KB), auto-regenerated after every mutation
(research runs, proposal approve/reject, insight status changes, source/KB edits). SQLite
remains the source of truth — the vault is a synced, read-through export, not a second
database — but it means any file-based tool (Obsidian, `grep`/`rg`, another LLM agent
with filesystem access) can read a knowledge base directly, with no app running:

```
vault/<kb-name>-<id>/
  _Overview.md       KB name, goal, description, [[category]] and source links
  01_Sources/         one file per tracked source + its fetched documents
  02_Knowledge/<category>/   one file per knowledge entry (Obsidian [[wikilinks]] to its category)
  03_Insights/        one file per insight, with evidence links
  04_Proposals/        one file per pending/reviewed change proposal
```

Implementation: `src/lib/vault/` (`paths.ts`, `markdown.ts`, `sync.ts`). Each sync is a
full, idempotent rewrite of one KB's folder (not an incremental patch) — simple and
correct, cheap at MVP scale. Renaming a KB renames its folder in place (detected by
matching the `id:` frontmatter in `_Overview.md`) instead of leaving an orphaned
duplicate. The vault path and a manual "Re-sync now" button are shown on each KB's
Settings tab.

This is **single-user local mode**: there is no authentication, and any request can read
or modify any knowledge base. This is explicitly out of scope for the MVP and must not be
treated as production-ready multi-user security.

## 6. Known limitations / P1-P2 not implemented

- **Semantic deduplication** — only exact (URL + content-hash) dedup is implemented.
  Near-duplicate articles from different sources will both be stored.
- **Embedding-based retrieval** — "relevant existing entries" for the Comparison/Insight
  agents uses keyword `contains` matching with a recency fallback, not embeddings.
- **Public HTML monitoring** is implemented (fetch + strip tags to text), but has no
  structured extraction beyond `<title>` + plain text — no CSS-selector targeting.
- **Knowledge version history UI** — the previous version is captured inside each
  `KnowledgeChangeProposal.proposedContent` (enabling rollback-by-reapplication), but
  there's no dedicated version-history browsing screen.
- **Source health dashboard** — status/last-error are shown per source on the Sources
  tab; no aggregate health view.
- Per the brief: no graph visualization, browser extension, mobile app, team
  collaboration, OAuth, real-time multi-user editing, autonomous code execution, or
  fine-tuning. Not attempted.

## 7. Security notes

- `ANTHROPIC_API_KEY` is read only in server-side code (`src/lib/ai/client.ts`) and never
  sent to the client.
- All fetched external content is treated as **untrusted data** — the Extraction Agent's
  system prompt explicitly instructs it to never follow instructions embedded in fetched
  content, and HTML is only ever converted to plain text, never executed.
- `src/lib/research/ssrf-guard.ts` blocks fetches (including every redirect hop) to
  loopback/private/link-local/CGNAT/metadata IP ranges, for both IPv4 and IPv6.
- `src/lib/research/http.ts` enforces a request timeout, a response size cap, an
  allowed-content-type list, retry with backoff, and a best-effort `robots.txt` check.
- Each research run is capped at `MAX_DOCUMENTS_PROCESSED_PER_RUN` (8) AI calls to bound
  token/cost spend per run.

## 8. Credentials required

- **Anthropic API key** (`ANTHROPIC_API_KEY`) — required for onboarding questions,
  blueprint generation, and the extraction/comparison/insight steps of a research run.
  Get one at https://console.anthropic.com/. Nothing else needs a credential — RSS and
  GitHub Releases fetching use public, unauthenticated endpoints.


  ## 9. Authors

- [Ellie Du](https://github.com/ellied07)
- [Huierpeng](https://github.com/huier2006-a11y)

## 9. Deploying to Vercel

- Framework preset **Next.js**, root directory `./`, default install (`npm install`, which runs
  `prisma generate` via `postinstall`) and build (`next build`) commands. Node 22 (`engines`).
- **Database:** the serverless filesystem can't hold the SQLite file, so production uses a hosted
  [Turso](https://turso.tech) (libSQL) database with the same schema, through Prisma's libSQL
  adapter (`src/lib/db/prisma.ts`). Local dev and tests are unchanged (SQLite file).
- **Environment variables** (all server-only — none are exposed to the browser):

  | Name | Purpose |
  |---|---|
  | `TURSO_DATABASE_URL` | Turso database URL (`libsql://…`) |
  | `TURSO_AUTH_TOKEN` | Turso auth token |
  | `ANTHROPIC_API_KEY` | Claude API key for all AI features |
  | `ANTHROPIC_MODEL` | Optional model override |
  | `VAULT_DIR` | Set to `/tmp/vault` (best-effort Markdown export; `/tmp` is temporary) |

- **Schema changes:** create the migration locally (`npm run db:migrate`), then apply it to Turso
  with `TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:migrate:turso` before deploying code
  that needs it. Re-running is safe (applied migrations are recorded in `_turso_migrations`).
- **Not available on Vercel:** scheduled (Daily/Weekly/Monthly) research — the in-process
  scheduler is disabled there; manual "Run Research Now" works. AI routes set `maxDuration`.
- **No authentication:** anyone who can open the deployment can read and change all data and
  use the configured Anthropic key (see §5/§7).
