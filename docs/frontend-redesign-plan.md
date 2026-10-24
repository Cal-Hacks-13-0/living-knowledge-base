# Frontend Redesign — Implementation Plan

**Source:** 6-screen mockup (app shell + wizard onboarding + AI Assistant), provided
2026-10-24. **Companion doc:** `docs/architecture-handoff.md` — read that first if you
don't already know the current codebase; this plan assumes you do.

This plan covers **frontend only**, with explicit call-outs wherever a screen implies
backend work that doesn't exist yet.

## Status: implemented (2026-10-24)

Everything in this plan has been built. How the open questions from §9 were resolved:

1. **Wizard routing**: one route (`/new`), step held in component state
   (`OnboardingWizard`), exactly as recommended. `?goal=` query param seeds step 1 from
   the Home hero. `lib/client/draft-store.ts` and `/new/blueprint` were deleted.
2. **Global sidebar during onboarding**: hidden — `/new` lives outside the `(shell)`
   route group entirely, so it never renders the app sidebar, matching the mockup.
3. **`MONTHLY` frequency**: added properly to the backend (`MonitoringFrequency` enum,
   scheduler cron expression `0 3 1 * *`, all three Select inputs) rather than mapped to
   `WEEKLY` — SQLite has no native enum constraint so this needed no data migration.
4. **Home (`/`) content**: it's actually the mockup's screen-1 hero (shown *inside* the
   shell) — submitting it seeds the wizard's step 1 via `?goal=`. Once ≥1 KB exists, Home
   also shows aggregate stats + a cross-KB recent-activity feed below the (now compact)
   hero. The old KB-grid page moved to `/knowledge` (sidebar's "All Knowledge").
5. **AI Assistant history**: ephemeral, as recommended — `POST
   /api/knowledge-bases/:id/chat` takes `{message, history}` per call and persists
   nothing server-side. Retrieval reuses `findRelevantEntries` (no new retrieval system).
6. **Global `/settings`**: scoped narrowly per the "don't build blind" guidance — AI
   config status + a links list to each KB's own settings page, nothing invented.

See `docs/architecture-handoff.md`'s own status update for the current file layout.

## 1. What's changing, at a glance

| Area | Today | New design |
|---|---|---|
| App shell | Simple top header (logo + "New KB" button) | Persistent left sidebar: Home / Search / Inbox / Settings nav + a "Knowledge Bases" list (all KBs, direct links) + user profile footer |
| Onboarding | 2 routes (`/new` then `/new/blueprint`), linear, driven entirely by dynamic AI questions | One wizard shell with a 5-step left stepper (Your goal / Preferences / Knowledge structure / Sources / Review & create), mixing AI-dynamic questions (step 1) with fixed UI steps (step 2: frequency + source-type checkboxes) |
| Blueprint review | Single long page, stacked cards (identity / categories / sources / priorities / rules / frequency) | Split across steps 3 (structure) and 4 (sources), compact row-based lists instead of cards |
| KB dashboard | Tab bar, stat cards, recent insights — all present already | Same, mostly a visual refresh (rows instead of cards for categories), **plus** a collapsible right-side AI Assistant chat panel |
| Global search | None (only per-KB library search) | New: sidebar "Search" nav item, implies cross-KB search |
| Inbox | None | New: sidebar "Inbox" nav item, implies a cross-KB pending-review feed (insights + proposals) |
| AI Assistant | None | New: right-side slide-in chat, scoped to the current KB, presumably RAG-style Q&A over its knowledge |

Everything in the existing dashboard/insights/library/sources/settings **data layer**
(API routes, Prisma models, orchestrator) stays as-is — this is an IA and presentation
rebuild, not a backend rewrite, except for the three new surfaces called out above.

## 2. New Information Architecture

```
RootLayout (app shell)
├── Sidebar (persistent, all routes)
│   ├── Home            -> /
│   ├── Search           -> /search
│   ├── Inbox             -> /inbox
│   ├── Settings           -> /settings  (global/app-level, NOT a KB's settings)
│   ├── "Knowledge Bases" section: All Knowledge (-> /), + one link per KB (-> /kb/[id])
│   └── "+ New Knowledge Base" -> /new
├── /new/*  (wizard, own left stepper nav — see §3)
└── /kb/[id]/*  (existing tab bar, PLUS new right-side AI Assistant panel — see §4)
```

Two sidebars will exist at different times: the **global app sidebar** (always, except
possibly hidden during the onboarding wizard, which the mockup shows with its own
step-sidebar instead) and the **KB horizontal tab bar** (unchanged, inside `/kb/[id]`).
Decide and confirm before building: does the global sidebar stay visible *during*
`/kb/[id]/*` (nested, i.e. sidebar + tabs both showing), or does the wizard fully replace
it? The mockup's screens 2-4 show *only* the step-sidebar, no global sidebar — treat the
wizard as a distinct full-screen layout, not nested inside the global shell.

## 3. Onboarding wizard rebuild

**Decision needed (flagging, not assuming):** should the 5 steps be 5 separate routes
(`/new/goal`, `/new/preferences`, `/new/structure`, `/new/sources`, `/new/review`) or one
route with step held in component state? Recommendation: **one route, state-held steps**
(`/new/page.tsx` renders `<OnboardingWizard>` which owns a `step` index) — simpler, avoids
re-fetching AI-generated questions/blueprint on back-navigation, and the current
`localStorage` draft-bridge (`lib/client/draft-store.ts`) can be **deleted entirely**
since there's no longer a route boundary to survive. If you need shareable/bookmarkable
step URLs, use a query param (`/new?step=3`) instead of separate routes — don't rebuild
the draft-store pattern for this.

Step-by-step:

1. **Your goal** — mostly exists today (`OnboardingFlow`'s goal input), but the mockup
   shows the *generated* questions answered as the same step's content once submitted
   (chips for single-select, pill+freeform for multi-select tags), not a second screen.
   Reuse `QuestionField` but restyle single_select as pill/chip buttons (already close to
   current) and multi_select as a **tag input** (new primitive — chips with an inline
   "+Add" for free text, not just checkboxes). `short_text` questions aren't shown in the
   mockup's step 1 example, but keep support.
2. **Preferences** — **new UI, no existing component.** Monitoring frequency as 3 radio
   pills (Daily/Weekly/Monthly — note the mockup adds **Monthly**, which the backend's
   `MonitoringFrequency` enum doesn't have (`MANUAL`/`DAILY`/`WEEKLY` only). Either (a)
   map "Monthly" to `WEEKLY` with a note, or (b) add `MONTHLY` to the Prisma enum +
   migration + scheduler cron expression — **flag this as a backend decision**, not a
   silent frontend choice. Source-type checkboxes (Official docs / Tech blogs / GitHub
   releases / Research papers / News & newsletters / Video content) and the free-text
   "Additional preferences" box don't map to any existing backend field — fold them into
   `KnowledgeBase.preferencesJson` (already a flexible JSON blob, no schema change) and
   pass them through to the Blueprint Agent prompt in `lib/ai/blueprint-agent.ts` so they
   actually influence source suggestions (otherwise this step is cosmetic).
3. **Knowledge structure** — mostly `CategoryList` already, but mockup shows compact rows
   (icon + name + description + "..." kebab menu) instead of today's card-with-textarea
   style. Needs a **dropdown/menu primitive** (see §7) for the "..." actions
   (rename/delete, matching current functionality).
4. **Sources** — mostly `SourceList` already, but mockup shows compact rows with a
   type-icon (RSS/GitHub/Web badge) instead of today's verified/unverified shield-icon
   card style. **Must preserve the verified-vs-unverified distinction** — this is a P0
   product requirement (the Blueprint Agent is explicitly told never to claim an
   unconfirmed URL is verified; the UI must keep surfacing that, e.g. via badge color or
   a tooltip on the type badge) even though the mockup doesn't visibly show it. Don't
   silently drop it to match the visual.
5. **Review & create** — not shown in the provided screens, but implied by the stepper
   list. Build as a read-only summary of steps 1-4 + the existing "Confirm & create"
   action (`POST /api/knowledge-bases`), same payload shape as today's `BlueprintEditor`.

## 4. KB workspace restyle + AI Assistant

- Overview tab: visually close to current already (stat cards, recent insights,
  knowledge categories list). Mostly restyle categories from the current Library's
  category concept into the compact row list shown — confirm whether "Knowledge
  categories" on Overview is a *new* summary block (counts per category) or just reusing
  existing category data; it appears new (category name + entry count), which is a
  simple aggregation query, not a new model.
- **AI Assistant panel (new feature, frontend + backend):**
  - Frontend: a slide-in right panel (needs a **Drawer/Sheet primitive**, see §7),
    toggleable, chat transcript (user/assistant message bubbles) + composer input at the
    bottom, scoped to the current KB (title bar shows "AI Assistant").
  - Backend: **does not exist today.** Needs a new endpoint, e.g.
    `POST /api/knowledge-bases/:id/chat` — `{message, history}` -> assistant reply.
    Implementation should follow the existing `generateText()`/`generateStructured()`
    pattern in `lib/ai/client.ts`, retrieve relevant `KnowledgeEntry`/`Insight` rows the
    same way `lib/knowledge/repository.ts::findRelevantEntries` already does (keyword
    overlap — reuse it, don't build new retrieval), and feed them into the prompt as
    grounding context with citations. This is a 6th "agent" in spirit — if you build it,
    add it to `lib/ai/` alongside the other five and document it in the handoff.
  - Scope decision needed: is chat history persisted (new `ChatMessage` model) or
    ephemeral (client-side state only, lost on refresh)? Recommend **ephemeral for v1**
    (simplest, matches "AI Assistant" feeling more like a tool than a saved thread) unless
    told otherwise.

## 5. New global surfaces

### Search (`/search`)
Cross-KB search over `KnowledgeEntry` (and arguably `Insight`). New endpoint needed:
`GET /api/search?q=...` — same `contains`-based approach as the existing per-KB
`/api/knowledge-bases/:id/entries?search=`, just without the `knowledgeBaseId` filter.
Reuse `LibraryBrowser`/`EntryCard` components with a "Knowledge Base" column/badge added
per result since results now span multiple KBs.

### Inbox (`/inbox`)
Cross-KB feed of everything needing review: `Insight.status = PENDING` +
`KnowledgeChangeProposal.status = PENDING`, across all KBs, newest first. No new model
needed — it's a query-scope change from the existing per-KB insights/proposals queries
(drop the `knowledgeBaseId` filter, add a KB-name badge per item). Reuse
`InsightCard`/`ProposalCard` as-is; they already take the row data as props and don't
assume a single-KB context.

### Global Settings (`/settings`)
Not detailed in the provided screens. Out of scope until there's a mockup for it —
**don't build a placeholder that silently does nothing**; either omit the nav item's
destination until designed, or scope it narrowly (e.g. just the "which Anthropic model"
/ nothing, since there's no multi-user concept to configure).

## 6. Components to add (new primitives, `components/ui/`)

None of these exist today (see handoff §7) — build as hand-rolled Tailwind components
consistent with the existing `cva`-based style, or add Radix primitives if you want
accessible behavior (focus trap, keyboard nav) for free. Recommendation: add
`@radix-ui/react-dropdown-menu` and `@radix-ui/react-dialog` (the latter doubles as the
Drawer base with custom slide-in styling) rather than hand-rolling focus management.

- **Sidebar nav item** (icon + label + active state) — simple, hand-roll.
- **Stepper** (vertical list of steps with active/completed/upcoming states) — hand-roll.
- **Pill/chip select button** — already exists inline in `QuestionField`'s single_select
  rendering; extract it into a real `components/ui/chip.tsx` so the wizard's goal/level
  pills and the preferences-step frequency pills share one implementation.
- **Tag input** (chips + free-text add, for multi-select-with-custom-values like the
  "technologies" field) — new, no current equivalent (today's multi_select is
  checkboxes only).
- **Dropdown/menu** (for row "..." actions) — new.
- **Drawer/Sheet** (right-side slide-in panel for AI Assistant) — new.
- **Chat message list + composer** — new, specific to the AI Assistant feature.
- **Compact row list item** (icon + title + subtitle + trailing badge/menu — used for
  category rows, source rows, and sidebar KB list items) — consider one shared component
  with slots rather than three near-duplicate ones.

## 7. Phased build order

1. **Primitives** — chip, tag-input, dropdown/menu, drawer, compact row item. No app
   changes yet; build in isolation (a quick `/dev/ui` scratch route is fine to delete
   later, or just eyeball via Storybook if you add it — not currently installed).
2. **Global app shell** — replace `app/layout.tsx`'s header with the sidebar shell.
   Sidebar's KB list = existing `prisma.knowledgeBase.findMany()` query (already used on
   `/`), just rendered in the sidebar instead of a page grid. Decide what Home (`/`)
   shows once the sidebar already lists every KB — recommend an activity/overview
   landing (e.g. aggregate stats + recent activity across KBs) rather than keeping the
   exact-duplicate card grid. **Flag this as a decision for the person doing design
   review**, don't just guess silently.
3. **Onboarding wizard rebuild** — new `OnboardingWizard` component replacing
   `OnboardingFlow` + `BlueprintEditor` + the localStorage bridge. Steps 1, 3, 4 are
   restyles of existing logic; step 2 (Preferences) and step 5 (Review) are new. This is
   the biggest single chunk of work.
4. **KB workspace restyle** — mostly CSS/layout changes to existing Overview page
   (category rows, stat card styling) to match the mockup; tab bar logic unchanged.
5. **Inbox** — new route + new cross-KB query, reusing `InsightCard`/`ProposalCard`.
6. **Search** — new route + new `/api/search` endpoint, reusing `EntryCard`.
7. **AI Assistant** — new backend endpoint + new chat UI. Do this last — it's the most
   backend-heavy new surface and the one most likely to need its own design iteration
   (retrieval quality, prompt tuning).
8. **Cleanup** — delete `lib/client/draft-store.ts` and `app/new/blueprint/` once the
   wizard replaces them; update `README.md`'s route table and the handoff doc.

## 8. Explicit must-not-regress list

Carry these over from the current implementation — they're P0 product requirements, not
styling choices, and the new visual design must still satisfy them:

- Nothing is persisted to the database until the user explicitly confirms at the end of
  onboarding (no silent KB creation while editing the wizard).
- Verified vs. unverified source distinction stays visible somewhere in the Sources step.
- Dynamic AI-generated onboarding questions (not a fixed static form) — the Preferences
  step is new *fixed* UI, but step 1's questions must stay AI-driven per-goal.
- `MonitoringFrequency` stays an explicit, visible choice (don't default-hide it) —
  resolve the Daily/Weekly/**Monthly** enum mismatch (see §3.2) before shipping, don't
  let the UI silently offer an option the backend can't honor.
- Single-user local mode stays undisguised — don't add UI (e.g. user switcher, team
  settings) that implies multi-user support that doesn't exist.

## 9. Open questions to resolve before/while building (not blocking, but flag explicitly)

1. Wizard: separate routes per step, or one route with state? (Recommended: one route.)
2. Global sidebar during onboarding: hidden (full-screen wizard) or nested? (Mockup
   implies hidden — confirm.)
3. `MONTHLY` monitoring frequency: add to backend enum, or map to `WEEKLY` in the UI?
4. Home (`/`) content once the sidebar already lists all KBs — keep as a KB grid, or
   redesign as an activity feed?
5. AI Assistant: persisted chat history or ephemeral per session?
6. Global `/settings`: no mockup provided — scope unknown, don't build blind.
