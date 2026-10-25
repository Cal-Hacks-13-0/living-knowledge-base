# Axion technical reference

Developer-facing details that used to live in the README. For an overview and setup
steps, start with the [README](../README.md).

A naming note: the app calls each collection a **knowledge vault**, but the code, routes
and database still use the original name `knowledgeBase` (and "KB").

## Contents

1. [Code layout](#1-code-layout)
2. [AI agents](#2-ai-agents)
3. [The research pipeline](#3-the-research-pipeline)
4. [Categories and the AI Assistant](#4-categories-and-the-ai-assistant)
5. [Source errors](#5-source-errors)
6. [API](#6-api)
7. [Markdown vault](#7-markdown-vault)
8. [Sign-in](#8-sign-in)
9. [Security](#9-security)
10. [Deployment details](#10-deployment-details)
11. [Testing](#11-testing)
12. [Known limitations](#12-known-limitations)

---

## 1. Code layout

```
src/
  app/
    (home)/              landing page
    new/                 5-step vault creation flow (goal → preferences → structure → sources → review)
    login/               sign-in page
    (shell)/             pages inside the app shell (sidebar + AI Assistant)
      knowledge/           All Knowledge (every vault)
      search/              search across all vaults
      inbox/               updates from every vault + weekly findings
      settings/            app settings
      kb/[id]/             one vault: Overview, Vault (library), Insights, Sources, Settings
    api/                 REST endpoints (see §6)
  components/            UI by feature (setup, library, sources, inbox, assistant, ui, …)
  lib/
    ai/                  Claude client + one module per agent, Zod schemas
    research/            fetchers (RSS, GitHub Releases, HTML), safe HTTP, dedup, orchestrator, source errors
    knowledge/           entry reads/writes, comparison glue, proposals, categorization
    inbox/               Inbox events and weekly digests
    vault/               Markdown export
    jobs/                in-process scheduler (node-cron)
    auth/                session cookies
    db/                  Prisma client (SQLite locally, Turso via libSQL adapter in production)
  proxy.ts               sign-in gate for every page and API route
prisma/                  schema, migrations, Turso migration script
tests/                   unit + integration tests (Vitest)
```

## 2. AI agents

All agents share `generateStructured()` in `src/lib/ai/client.ts`. It forces Claude to
call a single tool whose input schema comes from a Zod schema, then validates the result
with the same schema. If validation fails, the error goes back to the model as the tool's
result and it gets one retry.

| Agent | File | Job |
|---|---|---|
| Setup | `setup-agent.ts` | Up to 3 follow-up questions about the user's goal |
| Blueprint | `blueprint-agent.ts` | Proposed name, categories and sources |
| Extraction | `extraction-agent.ts` | Summarize one fetched document; pick its category from the vault's existing ones |
| Comparison | `comparison-agent.ts` | Compare it with existing notes (duplicate / extension / contradiction / …) |
| Insight | `insight-agent.ts` | Turn a run's findings into at most 3 insights |
| Assistant | `assistant-agent.ts` + `assistant-tools.ts` | Chat with tool use (see §4) |

The prompts are domain-agnostic. The one deliberately domain-aware piece is
`src/lib/research/known-sources.ts`, which recognizes well-known software projects so the
blueprint can suggest their real GitHub Releases feeds. Every other suggested source is
labeled as unverified, since the model can't browse the web to check that a URL works.

## 3. The research pipeline

`runResearch()` in `src/lib/research/orchestrator.ts` is the only pipeline. **Run Research
Now**, the AI Assistant and the scheduler all call it.

1. Refuse if a run is already in progress for the vault (HTTP 409).
2. For each active source, fetch with the matching adapter (RSS, GitHub Releases or HTML)
   through `safeFetch`. If an RSS source points at a web page, the fetcher looks for the
   feed the page advertises and switches the source to it. A failing source is recorded
   on that source (`status: ERROR`, `lastError`) and never stops the run.
3. Normalize documents (canonical URL, content hash) and drop exact duplicates before
   storing them as `SourceDocument` rows.
4. Up to **8** new documents per run go through Extraction → Comparison:
   - duplicate → skipped
   - new or extending existing knowledge → a **draft** note (`KnowledgeEntry`), filed
     under the category Extraction chose (only if that exact category exists; otherwise
     Uncategorized)
   - contradiction or replacement → a **proposal** (`KnowledgeChangeProposal`) for the
     user to approve or reject; existing notes are never overwritten automatically
5. The Insight Agent turns the run's findings into at most 3 insights, each linked to its
   evidence.
6. The run ends as `COMPLETED`, `PARTIAL` (some sources or AI steps failed, but real data
   was saved) or `FAILED` (every source failed).

**Scheduling.** `src/lib/jobs/scheduler.ts` (node-cron, started from
`src/instrumentation.ts`) runs research on each vault's Daily/Weekly/Monthly setting, but
only while the server process is running. It's disabled on Vercel.

## 4. Categories and the AI Assistant

- `src/lib/knowledge/categorize.ts` is the single write path for moving notes between
  categories, used by the Library's category picker and bulk "Move to category" bar and by
  the AI Assistant. Only the category changes: drafts stay drafts, and notes from other
  vaults are rejected.
- The Library groups notes under top-level categories; a note filed under a subcategory
  shows under its parent.
- The AI Assistant (`POST /api/assistant/chat`) works across all vaults. Its tools can:
  - save a pasted URL into a vault
  - run research
  - suggest starting a new vault
  - list categories and page through a vault's notes (25 at a time)
  - read a note in full
  - assign notes to a category

  The note and category tools only act on the vault the user is currently viewing. Chat
  history lives in the browser; nothing is stored on the server.

## 5. Source errors

`src/lib/research/source-errors.ts` turns the raw error stored on a source into a
plain-language title, explanation, next step and list of allowed actions. It's
deterministic (no AI call) and only claims what the error shows. For example, HTTP 403 is
"Access denied" and never "requires a subscription". Raw details stay available under
**Technical details** on the Sources tab, with credential-like values redacted.

Per-source actions: **Check again** (`POST …/sources/:sourceId/check`, fetch only; stores
nothing) and **Edit address** (`PATCH …/sources/:sourceId`).

## 6. API

Every response is `{ "ok": true, "data": … }` or `{ "ok": false, "error": { "message", "details"? } }`.
Request bodies are validated with Zod. Status codes: 400 invalid input, 401 not signed in,
404 not found, 409 conflict (run in progress, duplicate source), 412 AI not configured.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` | Sign in / out |
| POST | `/api/setup/questions` | Follow-up questions for a goal |
| POST | `/api/blueprints/generate` | Proposed vault structure |
| GET / POST | `/api/knowledge-bases` | List vaults / create one (with categories and sources) |
| GET / PATCH / DELETE | `/api/knowledge-bases/:id` | Read / edit / delete a vault |
| GET / POST | `/api/knowledge-bases/:id/categories` | List / add categories |
| DELETE | `/api/knowledge-bases/:id/categories/:categoryId` | Delete a category (its notes become Uncategorized) |
| GET / PATCH | `/api/knowledge-bases/:id/entries` | Search notes (`?search=&categoryId=`) / move notes to a category |
| GET / POST | `/api/knowledge-bases/:id/sources` | List / add sources |
| PATCH | `/api/knowledge-bases/:id/sources/:sourceId` | Change a source's address |
| POST | `/api/knowledge-bases/:id/sources/:sourceId/check` | Check one source now |
| POST | `/api/knowledge-bases/:id/research` | Run research (waits for it to finish) |
| GET | `/api/knowledge-bases/:id/research-runs` | Run history |
| GET | `/api/knowledge-bases/:id/insights` | Insights with evidence |
| PATCH | `/api/insights/:id` | Save / dismiss / mark an insight |
| GET | `/api/knowledge-bases/:id/proposals` | Proposals (`?status=`) |
| POST | `/api/proposals/:id/approve` · `/reject` | Apply (with a snapshot of the old version) / discard |
| POST | `/api/knowledge-bases/:id/vault/sync` | Rewrite the Markdown export now |
| GET | `/api/search` | Search notes across all vaults (`?q=`) |
| GET | `/api/inbox/findings` | This week's standout findings |
| POST | `/api/inbox/review` | This week's fuller written review |
| POST | `/api/assistant/chat` | AI Assistant |

## 7. Markdown vault

After every change, each vault is rewritten as plain Markdown under `VAULT_DIR` (default
`./vault`). The database stays the source of truth; the folder is an export that tools
like Obsidian, `grep` or another AI agent can read without the app running.

```
vault/<vault-name>-<id>/
  _Overview.md            name, goal, description, category and source links
  01_Sources/             one file per source and its fetched documents
  02_Knowledge/<category>/  one file per note
  03_Insights/            one file per insight, with evidence links
  04_Proposals/           one file per proposal
```

Code: `src/lib/vault/` (`paths.ts`, `markdown.ts`, `sync.ts`). Each sync fully rewrites
one vault's folder. Renaming a vault renames its folder.

## 8. Sign-in

`src/proxy.ts` requires a session cookie for every page and API route: pages redirect to
`/login`, API calls get 401. There's one shared password (`APP_PASSWORD`) for one shared
workspace, with no per-user accounts. Sessions are signed with `AUTH_SECRET`. With
neither set, the gate is open in development and refuses all requests in production.

## 9. Security

- `ANTHROPIC_API_KEY` is used only in server code.
- Fetched content is treated as untrusted data. The Extraction Agent is told never to
  follow instructions inside it, and HTML is only converted to text, never run.
- `src/lib/research/ssrf-guard.ts` blocks requests (including every redirect) to loopback,
  private, link-local, CGNAT and cloud-metadata addresses, for IPv4 and IPv6.
- `src/lib/research/http.ts` adds timeouts, a 3 MB size cap, an allowed content-type list,
  retries with backoff, and a best-effort `robots.txt` check.
- At most 8 documents per run go to the AI, which bounds cost.

## 10. Deployment details

- Vercel, Next.js preset, root `./`. `npm install` runs `prisma generate` through
  `postinstall`. Node 22 locally (`engines`); the Vercel project builds on its configured
  Node version.
- Production uses Turso through Prisma's libSQL adapter (`src/lib/db/prisma.ts`). Local
  development and tests use SQLite files.
- The Turso token can be named `TURSO_AUTH_TOKEN` or `TURSO_DATABASE_TURSO_AUTH_TOKEN`
  (the name Vercel's Turso integration uses); both work.
- Migrations: create them locally with `npm run db:migrate`, then apply them to Turso with
  `npm run db:migrate:turso` (`prisma/turso-migrate.mjs`) before the code that needs them
  goes live. Applied migrations are recorded in `_turso_migrations`, so re-running is safe.
- AI routes set `maxDuration` so long research runs aren't cut off.

## 11. Testing

`npm test` applies migrations to `prisma/test.db` and runs Vitest once (`npm run
test:watch` keeps it running). Claude and network calls are mocked, so tests are offline
and repeatable. `tests/setup.ts` refuses to run unless `DATABASE_URL` points at
`test.db`, because the tests delete all rows.

## 12. Known limitations

- Only exact duplicates (same URL or identical content) are detected.
- Finding related notes uses keyword matching, not embeddings.
- HTML sources are read as title plus plain text; no CSS-selector targeting.
- Previous versions are kept inside approved proposals, but there's no version-history screen.
- No per-user accounts; everyone with the password shares one workspace.
- Scheduled research needs a long-running server (not available on Vercel).
