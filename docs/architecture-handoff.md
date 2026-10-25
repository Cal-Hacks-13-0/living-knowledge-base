# Living Knowledge Base — Architecture Handoff

**Audience:** whoever implements the v2 frontend redesign (see `docs/frontend-redesign-plan.md`).
**Purpose:** everything you need to know about the existing codebase before touching it —
what exists, where it lives, and the conventions it follows — so new work stays consistent
instead of reinventing patterns that are already there.

This is a working MVP, not a prototype: it has a real Prisma/SQLite database, a real
Claude-backed AI pipeline, real RSS/GitHub fetchers with SSRF protection, and a Vitest
suite (43 tests) that all passes. The redesign only needs to change the **presentation
layer** (app shell, pages, components) — the backend/API/data layer described below is
stable and should be reused, not rebuilt, except where the plan explicitly calls out new
endpoints.

## 1. Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind CSS v4
(CSS-variable based config, no `tailwind.config.js`), Prisma 6.19.3 + SQLite,
`@anthropic-ai/sdk` (Claude), Zod 4, React Hook Form + `@hookform/resolvers`,
`lucide-react` icons, `node-cron`, `rss-parser`, Vitest. **No Radix UI, no state
management library, no Radix-based shadcn — the `components/ui/*` primitives are
hand-rolled** (see §7).

## 2. Repo layout

```
src/
  app/
    layout.tsx              Root layout — top header nav, force-dynamic, font vars
    page.tsx                 "/" — grid of all knowledge bases (current Home)
    new/page.tsx              Step 1+2 of onboarding (goal -> dynamic AI questions)
    new/blueprint/page.tsx    Step 3 of onboarding (editable blueprint review)
    kb/[id]/layout.tsx        Per-KB shell: fetches KB name, renders KbNav tabs
    kb/[id]/page.tsx          Overview tab
    kb/[id]/library/page.tsx  Library tab
    kb/[id]/insights/page.tsx Insights tab
    kb/[id]/sources/page.tsx  Sources tab
    kb/[id]/settings/page.tsx Settings tab
    api/**/route.ts           REST endpoints, see §4
  components/
    setup/        onboarding-flow.tsx, question-field.tsx
    blueprint/     blueprint-editor.tsx, category-list.tsx, source-list.tsx, string-list-editor.tsx
    dashboard/     kb-nav.tsx, run-research-button.tsx, settings-form.tsx, stat-card.tsx
    insights/      insight-card.tsx, proposal-card.tsx
    library/       library-browser.tsx, entry-card.tsx
    sources/       add-source-form.tsx
    ui/            button, input, textarea, label, card, badge, select, checkbox,
                   skeleton, empty-state, alert — hand-rolled, Tailwind + cva, no Radix
  lib/
    ai/            client.ts (Claude wrapper), schemas.ts (all Zod I/O schemas),
                   setup-agent.ts, blueprint-agent.ts, extraction-agent.ts,
                   comparison-agent.ts, insight-agent.ts  — see §5
    research/      orchestrator.ts (the pipeline), rss-fetcher.ts, github-fetcher.ts,
                   html-fetcher.ts, http.ts (safe fetch), ssrf-guard.ts, normalizer.ts,
                   deduplicator.ts, known-sources.ts, source-discovery.ts  — see §6
    knowledge/     repository.ts (reads), comparison.ts (agent glue), versioning.ts
                   (proposal create/approve/reject)
    jobs/          scheduler.ts (node-cron, in-process)
    db/            prisma.ts (singleton PrismaClient)
    validation/    schemas.ts (Zod schemas for API *request* bodies)
    api/           response.ts (ok()/fail()/handleApiError() — the response envelope)
    client/        api.ts (apiGet/apiPost/apiPatch fetch wrapper for client components),
                   draft-store.ts (localStorage bridge between /new and /new/blueprint)
    utils.ts       cn(), formatDate/formatDateTime/timeAgo
  instrumentation.ts  Boots the scheduler once on server start (Next.js hook)
prisma/
  schema.prisma    Full data model (11 models, all enums explicit) — source of truth
  migrations/
tests/
  unit/, integration/, helpers/db.ts
```

## 3. Data model (prisma/schema.prisma)

| Model | Purpose |
|---|---|
| `KnowledgeBase` | Root entity: name, description, userGoal, `preferencesJson` (free-form JSON string — **this is where new onboarding preference fields should go, no migration needed**), monitoringFrequency enum |
| `KnowledgeCategory` | Self-referential (`parentId`) — one level of nesting used today (category -> subtopics) |
| `Source` | A monitored feed/repo/page: type (RSS/GITHUB_RELEASES/HTML), status (ACTIVE/PAUSED/ERROR), etag/lastModified for conditional fetches |
| `SourceDocument` | Raw fetched content, deduped by (sourceId, url) and (sourceId, contentHash) |
| `KnowledgeEntry` | Curated knowledge, optionally linked to a category and the SourceDocument it came from |
| `Insight` | AI-generated insight (5 types), status PENDING/SAVED/DISMISSED/ACTIONED |
| `InsightEvidence` | Join table: insight -> sourceDocument (+ optional knowledgeEntry) with an explanation |
| `ResearchRun` | One row per pipeline execution: status, counts, errorMessage |
| `KnowledgeChangeProposal` | Pending review item for risky operations (UPDATE/MERGE/DELETE/MARK_OBSOLETE); `proposedContent` is a JSON string holding `{operation, previous, proposed, explanation}` — this is how rollback/audit works, there's no separate version table |

All IDs are `cuid()`. Nothing is soft-deleted except via status enums (e.g. OUTDATED,
SUPERSEDED) — there is no multi-user ownership field anywhere (single-user local mode).

## 4. Backend/API conventions

Every route handler follows the same shape:

```ts
export async function GET(req, { params }) {
  try {
    const { id } = await params;          // params is a Promise in Next 16
    const body = SomeZodSchema.parse(await req.json()); // for POST/PATCH
    ...
    return ok(data);                       // { ok: true, data }
  } catch (err) {
    return handleApiError(err);            // maps ZodError->400, NotFoundError->404,
  }                                         // MissingApiKeyError->412, OverlappingRunError->409,
}                                           // else 500
```

- `lib/api/response.ts` is the single source of truth for the response envelope and error
  mapping — any new route should use `ok()`/`fail()`/`handleApiError()`, not ad-hoc
  `NextResponse.json`.
- `lib/validation/schemas.ts` holds request-body Zod schemas (distinct from
  `lib/ai/schemas.ts`, which holds the AI agents' structured-output schemas).
- **Server components query Prisma directly** (no internal fetch round-trip) — every
  current page (`page.tsx`, `layout.tsx`) is an `async` server component that does
  `await prisma.x.findMany(...)`. Only **client components** (anything with `"use
  client"` that needs interactivity) go through `lib/client/api.ts`
  (`apiGet`/`apiPost`/`apiPatch`), which unwraps the `{ok,data|error}` envelope and
  throws `ApiError` on failure.
- Mutations from client components call `router.refresh()` afterward to re-run the
  server component data fetch rather than managing client-side cache — there is no
  SWR/React Query/Zustand in this codebase. Keep that pattern unless you have a strong
  reason to introduce client-side caching for the new features (e.g. the AI Assistant
  chat will need local message state, which is fine/expected — just don't reach for a
  global store for everything else).
- The whole app is `export const dynamic = "force-dynamic"` (set once, in root
  `layout.tsx`) because every page reads live DB state. Next.js 16's `cacheComponents`
  experimental feature is explicitly **disabled** in `next.config.ts` for the same
  reason — don't re-enable it without wrapping every data access in Suspense.

### Current REST surface (all under `/api`)

```
POST   /setup/questions                          -> { questions: SetupQuestion[] }
POST   /blueprints/generate                       -> BlueprintResponse
GET    /knowledge-bases                           list, with _count
POST   /knowledge-bases                            create (KB + categories + sources, transactional)
GET    /knowledge-bases/:id                        detail + pendingInsights/pendingProposals counts
PATCH  /knowledge-bases/:id                        name/description/monitoringFrequency
GET    /knowledge-bases/:id/sources
POST   /knowledge-bases/:id/sources
POST   /knowledge-bases/:id/research               runs the orchestrator synchronously
GET    /knowledge-bases/:id/research-runs
GET    /knowledge-bases/:id/insights
PATCH  /insights/:id                                status change
GET    /knowledge-bases/:id/entries                 ?search=&categoryId=
GET    /knowledge-bases/:id/proposals                ?status=
POST   /proposals/:id/approve
POST   /proposals/:id/reject
```

**None of these are cross-KB.** The new design's Search and Inbox need new
cross-knowledge-base queries — see the plan doc for what to add.

## 5. AI layer (`lib/ai/`)

One shared primitive, `generateStructured()` in `client.ts`: builds a JSON Schema from a
Zod schema (`z.toJSONSchema`), forces Claude to call a single tool with that schema as
`input_schema`, validates the tool call's input against the same Zod schema, retries once
with the validation error fed back on failure. Every agent is just a system prompt + a
call to this function:

| Agent | File | In -> Out |
|---|---|---|
| Setup | `setup-agent.ts` | goal + prior answers -> ≤3 dynamic onboarding questions |
| Blueprint | `blueprint-agent.ts` | goal + answers -> name/description/categories/sources/frequency/rules. Merges in deterministic "verified" sources from `research/known-sources.ts` (recognized GitHub repos; Hacker News is filtered out of drafted blueprints) since the model can't confirm URLs are live |
| Extraction | `extraction-agent.ts` | one fetched document -> summary/claims/topics/excerpts (treats document content as untrusted data, explicitly told to ignore embedded instructions) |
| Comparison | `comparison-agent.ts` | new extraction + candidate existing entries -> DUPLICATE/EXTENSION/CONTRADICTION/REPLACEMENT_CANDIDATE/UNRELATED + optional proposed change |
| Insight | `insight-agent.ts` | all findings from one run + existing entries -> ≤3 ranked insights, often zero |

`isAiConfigured()` / `MissingApiKeyError` in `client.ts` gate everything — if
`ANTHROPIC_API_KEY` is unset, AI endpoints return HTTP 412 with a clear message instead
of silently failing. Any new AI-backed feature (e.g. the AI Assistant chat) should follow
the same `generateStructured()` or a new `generateText()`-based helper already in
`client.ts`, and the same missing-key handling.

## 6. Research pipeline (`lib/research/`, orchestrated by `orchestrator.ts`)

`runResearch(knowledgeBaseId)` is called by both the "Run Research Now" button and the
scheduler — one implementation. Per run: refuse if already RUNNING for that KB (409) ->
fetch each non-paused source through `http.ts`'s `safeFetch` (SSRF-guarded via
`ssrf-guard.ts`, timeout, size cap, content-type allowlist, retry+backoff, robots.txt
check, conditional ETag/Last-Modified) -> normalize + exact-dedup
(`normalizer.ts`/`deduplicator.ts`) -> store `SourceDocument` rows -> up to 8 new docs go
through Extraction -> Comparison -> auto-create `DRAFT` entries for safe classifications,
create a `PENDING` `KnowledgeChangeProposal` for risky ones -> one batched Insight Agent
call -> run marked COMPLETED/PARTIAL/FAILED. This is all backend and should not need to
change for the frontend redesign — the frontend just needs to keep rendering
`ResearchRun`/`Source`/`Insight`/`KnowledgeChangeProposal` state (now possibly in new
layouts/components).

## 7. Current frontend inventory

### Pages (route -> file)

| Route | File | Notes |
|---|---|---|
| `/` | `app/page.tsx` | Server component, grid of KB cards, empty state with scenario suggestions |
| `/new` | `app/new/page.tsx` | Renders `<OnboardingFlow>` |
| `/new/blueprint` | `app/new/blueprint/page.tsx` | Renders `<BlueprintEditor>`, reads draft from `localStorage` (see below) |
| `/kb/[id]` | `app/kb/[id]/page.tsx` | Overview: stat cards, recent insights, pending-review banner |
| `/kb/[id]/library` | ... | `<LibraryBrowser>` (search/filter via debounced client fetch) |
| `/kb/[id]/insights` | ... | Proposals section + insights section, both server-rendered lists of client cards |
| `/kb/[id]/sources` | ... | Source health rows + `<AddSourceForm>` |
| `/kb/[id]/settings` | ... | `<SettingsForm>` |

`app/layout.tsx` currently renders one global header: logo text + a single "New
knowledge base" button, no sidebar, no per-KB nav (that's inside `kb/[id]/layout.tsx`
instead, as a horizontal tab bar via `<KbNav>`). **This is the main structural piece the
redesign replaces** — see the plan doc.

### Onboarding data flow (important — the redesign changes this)

`OnboardingFlow` (client) collects goal -> POSTs `/api/setup/questions` -> renders
dynamic questions via RHF `Controller` + per-question `<QuestionField>` -> POSTs
`/api/blueprints/generate` -> writes `{userGoal, answers, blueprint}` to
`localStorage` via `lib/client/draft-store.ts` -> `router.push("/new/blueprint")`.
`BlueprintEditor` (client) reads that draft on mount, lets the user edit everything in
React state, and only on explicit "Confirm & create" POSTs `/api/knowledge-bases` and
calls `clearDraft()`. **If the new wizard becomes a single page/component with 5 steps
instead of 2 routes, this localStorage bridge can be deleted entirely** — it only exists
to survive a route navigation.

### UI primitives (`components/ui/`)

Hand-rolled (no Radix), Tailwind + `class-variance-authority` for variants, `cn()` merges
classes. Inventory: `Button` (variants: default/secondary/ghost/destructive/link, sizes
default/sm/lg/icon), `Input`, `Textarea`, `Select` (native `<select>`), `Checkbox`
(native), `Label`, `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`,
`Badge` (variants: default/neutral/success/warning/danger), `Alert`, `EmptyState`,
`Skeleton`. **There is no Dropdown/Menu, Drawer/Sheet, Popover, Tabs (the KB nav is
hand-rolled with `usePathname`), Dialog, Tag/Chip-input, or Stepper component** — the new
design needs several of these (see plan doc §7).

### Styling

Tailwind v4, CSS-variable tokens defined in `app/globals.css` under `:root` and mapped
via `@theme inline` (no `tailwind.config.js` — v4 is CSS-first). Current tokens:
`--background`, `--foreground`, `--muted`, `--border`, `--surface`, `--accent` (indigo,
`#4f46e5`), `--accent-foreground`, `--accent-soft`. Dark mode is **not** implemented
(deliberately, per the "white/near-premium SaaS" brief) — if the redesign wants dark
mode, that's new scope, flag it explicitly.

## 8. Testing

`vitest.config.mts`, `tests/setup.ts` sets a fake `ANTHROPIC_API_KEY` env var so
`isAiConfigured()` is true in tests. Two patterns used throughout:
- Mock `@anthropic-ai/sdk`'s default export class so `messages.create` is a `vi.fn()`
  returning canned `tool_use` blocks (see `tests/unit/comparison-agent.test.ts`,
  `tests/integration/full-flow.test.ts`).
- Mock `@/lib/research/http` (the `safeFetch`/`withRetry`/`isAllowedByRobots` layer) to
  avoid real network calls (see `tests/unit/rss-fetcher.test.ts`).
- DB-touching tests use a dedicated `prisma/test.db` (never `dev.db`), reset via
  `tests/helpers/db.ts::resetDb()` in `beforeEach`. `vitest.config.mts` sets
  `fileParallelism: false` because multiple test files share that one SQLite file.
- No component/UI tests exist yet (no Testing Library installed). If the redesign wants
  component tests, that's a new dependency to add, not an existing pattern to follow.

Run: `npm test` (migrates `test.db` then runs once), `npm run test:watch`.

## 9. Running locally

```bash
npm install
cp .env.example .env     # set ANTHROPIC_API_KEY
npm run db:migrate        # applies prisma/migrations to prisma/dev.db
npm run dev                # http://localhost:3000, also boots the scheduler
```

`npm run db:studio` opens Prisma Studio on `dev.db` if you want to inspect/seed data
directly while building UI.

## 10. Gotchas worth knowing before you touch things

- **Prisma major version**: pinned to `6.19.3` on purpose. Prisma 7/8 (latest on npm)
  changed how `datasource.url` works (requires `prisma.config.ts` + driver adapters) and
  broke `prisma migrate dev` as used here. Don't `npm update` prisma without re-reading
  that migration guide.
- **SQLite relative paths** (`file:./dev.db` in `.env`) resolve relative to
  `prisma/schema.prisma`'s directory, not the repo root or `process.cwd()` — the actual
  file ends up at `prisma/dev.db`.
- **The scheduler only runs while the dev/prod server process is alive** (`node-cron`,
  booted via `src/instrumentation.ts`). This is a documented, intentional MVP limitation,
  not a bug — don't "fix" it by adding a persistent worker unless that's explicitly asked
  for.
- `npm run lint` currently passes clean including React's `react-hooks/set-state-in-effect`
  rule; one legitimate exception is suppressed inline in `blueprint-editor.tsx` (reading
  `localStorage` after mount) — follow that pattern (narrow `eslint-disable-next-line`
  with a comment explaining why) rather than disabling the rule file-wide.
- There is **no authentication** anywhere — single-user local mode by design, documented
  in the README. Don't add auth as a side effect of the redesign unless asked.

## 11. Status update (2026-10-24) — v2 frontend shipped

The redesign in `docs/frontend-redesign-plan.md` has been implemented. §2, §7, and §8
above describe the **original** (pre-redesign) structure — still useful for
understanding *why* things are organized the way they are, but the current file tree and
route list are now:

- `app/new/` — the 5-step onboarding wizard (`components/setup/onboarding-wizard.tsx`),
  full-screen, no app sidebar. `app/new/blueprint/` and `lib/client/draft-store.ts` are
  gone — step state lives in one component, no cross-route localStorage bridge needed.
- `app/(shell)/` — new route group holding the persistent sidebar app shell
  (`app/(shell)/layout.tsx` + `components/dashboard/sidebar.tsx`) and everything that
  renders inside it: `page.tsx` (Home — hero + aggregate stats + activity feed),
  `knowledge/` (the old KB grid, moved here), `search/`, `inbox/`, `settings/` (app-level,
  distinct from each KB's own `/kb/[id]/settings`), and `kb/[id]/*` (unchanged tab set,
  moved into the group).
- `components/ui/` gained five hand-rolled primitives with no new dependency: `chip.tsx`,
  `tag-input.tsx`, `dropdown-menu.tsx`, `drawer.tsx`, `row-item.tsx`.
- `components/assistant/ai-assistant-panel.tsx` + `components/dashboard/kb-workspace.tsx`
  + `lib/ai/assistant-agent.ts` + `POST /api/knowledge-bases/:id/chat` — the AI Assistant
  chat. **Corrected in §13**: this is a persistent side panel the content column makes
  room for, not a modal `Drawer` — `kb-workspace.tsx` owns the open/closed state so the
  toggle button (in the KB header) and the panel stay in sync. Ephemeral (client-held
  history, nothing persisted), grounded via the existing `findRelevantEntries`
  keyword-overlap retrieval (no new retrieval system).
- `GET /api/search` — cross-KB entry search (`app/(shell)/search/`); `app/(shell)/inbox/`
  reuses the existing `InsightCard`/`ProposalCard` components with a cross-KB query
  (no new models, just dropped the `knowledgeBaseId` filter).
- `MonitoringFrequency` gained `MONTHLY` (`prisma/schema.prisma`, `lib/jobs/scheduler.ts`
  cron map, `lib/ai/schemas.ts`). SQLite has no enum CHECK constraint, so this needed a
  Prisma Client regen only, no migration file.
- `lib/ai/blueprint-agent.ts::generateBlueprint` now takes an optional third
  `preferences` argument and weaves it into the prompt — `POST /api/blueprints/generate`'s
  request schema grew a matching `preferences` field. The schema still has optional
  `sourceTypes`/`additionalNotes` sub-fields (harmless, default to empty), but **the
  wizard's Preferences step was trimmed to just monitoring frequency** (§13) — it never
  sends them anymore. Don't assume they're populated.

All conventions in §4 (API envelope, server-components-query-Prisma-directly,
`lib/client/api.ts` for client mutations, `router.refresh()` after writes) were kept
as-is for every new page/route above — nothing new was introduced.

## 12. Markdown vault (2026-10-24)

`src/lib/vault/` syncs every knowledge base to a plain Markdown folder tree under
`VAULT_DIR` (default `./vault`), so Obsidian or any filesystem-reading agent can consume
a knowledge base without going through the app/API at all.

- `paths.ts` — `vaultRoot()` (reads `process.env.VAULT_DIR` at call time, not module
  load, so tests can override it), slug-based file/folder naming.
- `markdown.ts` — pure render functions (one per entity: KB overview, entry, insight,
  source, proposal) producing frontmatter + body. Frontmatter string values are
  `JSON.stringify`'d rather than hand-quoted YAML — sidesteps quoting edge cases, still
  valid YAML.
- `sync.ts` — `syncKnowledgeBaseToVault(id)` does a **full rewrite** of one KB's folder
  from current DB state (not an incremental patch) — correct and simple at MVP scale.
  Detects the existing folder via each `_Overview.md`'s `id:` frontmatter and renames it
  in place on a KB rename, rather than leaving an orphaned duplicate.
  `syncKnowledgeBaseToVaultSafe` wraps it to log-and-swallow errors, since a vault write
  failure must never fail the API request whose DB write already succeeded.
- Wired into every mutation: KB create/update, source add, insight status change,
  proposal approve/reject, and `orchestrator.runResearch`'s `finally` block (so even a
  partial/failed run's new documents/entries still get reflected).
- **Test isolation gotcha**: several tests call `runResearch`/the KB API routes directly,
  which now also trigger a vault sync as a side effect. `tests/setup.ts` sets a global
  `VAULT_DIR` override (`.vitest-vault/`, gitignored) so no test run ever writes into the
  real project `vault/` folder. `tests/unit/vault-sync.test.ts` narrows further to its
  own temp dir for precise assertions.

## 13. Category fix, category management, onboarding polish, UI cleanup (2026-10-24)

### Category matching bug + fix

`lib/knowledge/repository.ts::matchCategoryByTopics` used to query **all**
`KnowledgeCategory` rows for a KB (top-level categories *and* subtopics, since subtopics
are just rows with `parentId` set) and substring-match topics against every name. A topic
like `"china"` would match a subtopic named `"VCT China"`, so new entries ended up tagged
with categories that never appeared in the Library's category list/filter — looked like
random/inconsistent categorization. **Fixed**: the query now filters `parentId: null`, so
entries are only ever auto-tagged with top-level categories — subtopics are structural
only, never a `KnowledgeEntry.categoryId` target going forward. (Pre-existing bad data in
a running `dev.db` isn't auto-migrated — if you find more of it, same one-off fix as
before: nullify entries whose `category.parentId` isn't null, optionally re-match against
top-level categories using the entry's own title/summary as crude topics.)

### Category management (new)

Categories are no longer fixed at KB-creation time — added CRUD (create + delete; no
rename endpoint, wasn't asked for) reachable from the Library tab:

- `GET/POST /api/knowledge-bases/:id/categories` — list (top-level only, with
  `_count.entries`) / create. Create does a `findFirst` uniqueness pre-check rather than
  `findUnique` on the compound key, because Prisma's generated compound-unique input type
  requires `parentId: string` (non-nullable) even though the column is nullable — SQL
  `NULL` has no equality match, so `findUnique` can't be used to look up `parentId: null`.
- `DELETE /api/knowledge-bases/:id/categories/:categoryId` — deletes the category and its
  subtopics (`deleteMany({where:{parentId}})` then `delete`) in a transaction. Entries
  referencing it fall back to `null` (Prisma's `onDelete: SetNull`) — nothing else is
  touched.
- `components/library/category-manager.tsx` — collapsible panel on the Library page
  (list with delete buttons + an add form). `components/library/library-browser.tsx` was
  rewritten to **group entries by category** (section per top-level category, plus an
  "Uncategorized" bucket) instead of a flat grid with a dropdown filter; `EntryCard` no
  longer repeats the category as a per-card badge since the section heading already says
  it. Both category routes call `syncKnowledgeBaseToVaultSafe` (§12) after mutating.

### Onboarding wizard polish

- **Every setup question is now rendered identically**, regardless of the AI's declared
  `type` (`single_select`/`multi_select`/`short_text` is still in the schema/response but
  no longer branches the UI): `QuestionField` always renders `TagInput` with
  `suggestions: question.options.slice(0, 3)` — up to 3 multi-selectable chips plus a
  free-text "Other" field. `lib/ai/setup-agent.ts`'s system prompt was updated to always
  generate exactly 3 options per question (previously only "select type" questions got
  options; `short_text` got none). `answers` state in `onboarding-wizard.tsx` is now
  always `Record<string, string[]>` — no more `string | string[]` branching.
- **Preferences step trimmed** (`components/setup/preferences-step.tsx`) to just
  monitoring frequency — the source-type checkboxes and free-text notes field were
  removed from the UI (the `WizardPreferences` type now only has
  `monitoringFrequency`). See the §11 correction above re: the backend field still
  existing but going unused.
- **Blueprint regeneration is skipped when nothing changed**: `onboarding-wizard.tsx`
  keeps a `blueprintInputsSnapshot` (JSON of `{answers, monitoringFrequency}` as of the
  last successful generation) and a derived `blueprintIsStale` flag. Going Back from step
  3 to step 2 and forward again without editing anything skips the
  `/api/blueprints/generate` call entirely and just advances `stepIndex`; the forward
  button's label reflects this live — "Next" when not stale, "Drafting your blueprint"
  when it would regenerate. If you add more inputs that affect blueprint generation,
  fold them into the snapshot key or this silently goes stale.
- `components/blueprint/category-list.tsx`: "Add subtopic" moved out of the "..."
  dropdown into an always-visible `+ Add subtopic` button at the bottom of each
  category's subtopic list (kebab menu now only has Rename/Delete).
- `components/blueprint/source-list.tsx`: dropped the verified/unverified
  shield-icon/badge display entirely (the `BlueprintSource.verified` field still exists
  in the data model and still drives `discoverVerifiedSources`'s behavior — only the UI
  stopped showing it).
- Step headings: step 3 is now "Review your blueprint" (was "...knowledge structure").
  Step 5 ("Review & create") no longer shows Research priorities / Maintenance rules
  editors — `blueprint.researchPriorities`/`maintenanceRules` are still generated by the
  Blueprint Agent and still part of `BlueprintResponse`, just unused/discarded after step
  2 now (they were never persisted to the DB in the first place — `POST
  /api/knowledge-bases` never accepted them). `components/blueprint/string-list-editor.tsx`
  was deleted (it had no remaining callers).

### User-facing error display cleanup

Per explicit product direction, raw technical error strings are no longer shown to the
user:
- `app/(shell)/kb/[id]/sources/page.tsx`: no more "ERROR" badge or raw
  `source.lastError` text under a source card (parser/fetch error strings like `"Attribute
  without value Line: 0..."` were leaking straight to the UI). `lastError` is still
  written to the DB by the orchestrator (§6) — just not rendered. ACTIVE/PAUSED badges
  still show.
- `components/dashboard/run-research-button.tsx`: the post-run result message no longer
  appends `ResearchRun.errorMessage` — just the fetched/processed/insight counts.
- If you need to resurface error detail later (e.g. a "Source health" admin view), read
  it from `Source.lastError` / `ResearchRun.errorMessage` directly — the data was never
  removed, only its default-visible rendering.

### Rename: Library -> Vault (nav label only)

`components/dashboard/kb-nav.tsx`'s tab label changed from "Library" to "Vault", and the
Overview page's "What's in the Knowledge Library" card title to "What's in the Vault" —
**cosmetic only**, the route is still `/kb/[id]/library` and nothing else changed. Don't
confuse this with the *actual* Markdown vault feature in §12 (`lib/vault/`, the
filesystem export) — they're two unrelated things that happen to now share a name in the
UI, because the user's mental model treats the in-app Library as "their vault" the same
way the on-disk Markdown export is. If this gets confusing, it might be worth renaming
the route too at some point — not done here since it wasn't asked for.

### Home page centering

`app/(shell)/page.tsx`'s root container is `flex min-h-full flex-col items-center
justify-center` — the hero + stats + activity block is vertically and horizontally
centered in the viewport (vs. previously being top-anchored with empty space below on
short content). This relies on `<main>` in `app/(shell)/layout.tsx` having a definite
height (it does, via flex-stretch inside the `h-dvh` row) for `min-h-full` to resolve.
Other `(shell)` pages (Search/Inbox/Settings/Knowledge) were deliberately left
top-anchored — they're list-heavy and read better starting from the top.
