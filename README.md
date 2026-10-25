# Axion

**Axion keeps a knowledge vault up to date for you.** Tell it what you want to learn or
track, and it builds an organized vault on that topic, watches the websites and feeds that
matter, and brings you what's new, so you don't have to keep checking them yourself.

It works for any subject: a programming framework, a hobby like rock climbing or drumming,
a business idea, a research area.

And everything Axion learns is also saved as **plain Markdown files**: readable, portable,
and yours.

---

## What you can do with it

- **Start a vault from a single sentence.** Describe your goal ("I want to learn the
  drums"). Axion asks a few follow-up questions, then proposes a structure: categories to
  organize knowledge into, and sources to watch. You review and edit everything before
  anything is created.
- **Let it do the research.** Press **Run Research Now** and Axion reads your sources,
  skips what it has already seen, and turns new articles into short notes filed under the
  right category.
- **Stay in control of changes.** New information is added as draft notes. If something
  new *contradicts* what's already in your vault, Axion doesn't overwrite it. It creates a
  proposal for you to approve or reject.
- **Get the highlights.** Insights point out what's actually new or worth acting on. The
  **Inbox** collects updates from all your vaults, with a weekly summary of the
  standout findings.
- **Ask the AI Assistant.** Ask questions about your vaults, paste a link to save it, run
  research, or have it organize uncategorized notes into categories.
- **Keep your vault healthy.** The Sources tab explains in plain language when a website
  can't be read (page moved, access denied, and so on) and lets you fix the address or
  check again.
- **Own your knowledge in Markdown.** Every vault is also saved as a folder of plain
  Markdown files, kept in sync automatically (more below).

## Your knowledge, in plain Markdown

Every vault is automatically saved as a folder of ordinary Markdown (`.md`) files, and
updated every time something changes: new notes, insights, approved proposals, edits.
This is one of Axion's best features:

- **Readable by anyone.** Markdown is just text with light formatting. Open it in any
  editor and it makes sense, no app required.
- **Works with Obsidian out of the box.** Notes link to their categories with
  `[[wikilinks]]`, so you can browse a vault as a connected graph.
- **Great for AI tools.** Other AI assistants and agents can read your vaults directly
  from the files. Markdown is a format they handle especially well.
- **Portable, with no lock-in.** Copy the folder, search it, back it up, or put it in Git.
  Your knowledge isn't trapped inside Axion.

Each vault becomes a tidy folder:

```
vault/drumming-foundations/
  _Overview.md          the goal, description, categories and sources
  01_Sources/           one file per source, listing what was fetched
  02_Knowledge/         your notes, in one folder per category
  03_Insights/          highlights, with links to their evidence
  04_Proposals/         suggested changes waiting for your review
```

The files are saved to the `vault/` folder (change it with `VAULT_DIR`). The app's
database stays the main record and the Markdown is a complete copy kept in sync. Edits
you make to the files aren't read back into the app.

## The idea in one picture

```
 Your goal ─► Axion suggests a plan ─► You approve it ─► Axion watches your sources
                                                                │
        You review ◄── Insights & proposals ◄── New info is compared with what you know
```

---

## Running it on your computer

You'll need **Node.js 22** and an **Anthropic API key** (get one at
[console.anthropic.com](https://console.anthropic.com/)).

```bash
npm install
cp .env.example .env        # then open .env and paste your ANTHROPIC_API_KEY
npm run db:migrate          # creates the local database
npm run dev                 # open http://localhost:3000
```

No API key yet? The app still runs: you can browse, add sources, and fetch content. The
AI features will tell you clearly that they need a key rather than making things up.

Locally there's no sign-in screen. Sign-in only turns on when a password is configured
(see *Publishing it online*).

### Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app at http://localhost:3000 |
| `npm test` | Run the tests (uses a separate test database; your data is never touched) |
| `npm run lint` | Check the code style |
| `npm run build` | Make a production build |
| `npm run db:studio` | Browse the local database in your browser |

> Always run tests with `npm test`, not `npx vitest` directly: the npm script is what
> points the tests at their own throwaway database.

---

## Publishing it online

Axion is set up to deploy on **[Vercel](https://vercel.com)** with a hosted
**[Turso](https://turso.tech)** database (the online version of the same SQLite database).
Every push to the `main` branch deploys automatically.

**Settings to add in Vercel** (all stay on the server and are never sent to the browser):

| Setting | What it's for |
|---|---|
| `ANTHROPIC_API_KEY` | Powers all the AI features |
| `ANTHROPIC_MODEL` | *(Optional)* which Claude model to use |
| `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` | Connect to the online database (Vercel's Turso integration adds these for you) |
| `APP_PASSWORD` | The password people type to sign in |
| `AUTH_SECRET` | A long random string that keeps sign-ins secure (`openssl rand -hex 32`) |
| `VAULT_DIR` | Set to `/tmp/vault` |

**When the database structure changes**, update the online database *before* the new code
goes live:

```bash
TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:migrate:turso
```

It's safe to run more than once: it only applies changes that haven't been applied yet.

**Good to know about the online version:**

- Everyone signs in with the same shared password, and everyone sees the same vaults.
  There are no individual accounts.
- Automatic Daily/Weekly/Monthly research doesn't run on Vercel. Use **Run Research Now**.
  (On your own computer, automatic research runs while the app is open.)
- On Vercel, the Markdown copy is written to temporary storage, so it doesn't last
  between visits; your data itself is safe in the database. Run Axion on your own
  computer to keep a permanent Markdown folder.

---

## How it's built

- **App:** [Next.js](https://nextjs.org) 16 and React 19, styled with Tailwind CSS
- **AI:** Claude, via the Anthropic API
- **Database:** SQLite through Prisma (Turso when deployed)
- **Tests:** Vitest. They never call the real AI or the internet

The main folders:

```
src/app/          pages and API endpoints
src/components/   the interface, grouped by feature
src/lib/ai/       the AI steps (questions, blueprint, reading articles, insights, assistant)
src/lib/research/ fetching and reading sources safely
prisma/           database structure and its history of changes
tests/            automated tests
```

Want the details (how the research pipeline works, the API, the Markdown vault format,
security measures)? See **[docs/technical-reference.md](docs/technical-reference.md)**.

## Safety, in short

- Your API key is only used on the server.
- Content from websites is treated as plain text and never as instructions, and Axion
  won't fetch private or internal network addresses.
- Axion respects websites' `robots.txt` rules, uses timeouts and size limits, and caps how
  much AI work one research run can do.

## Current limitations

- Duplicate articles are caught only when they're exact copies; reworded versions of the
  same story may both be saved.
- Finding related notes uses keyword matching rather than meaning-based search.
- Web pages are read as plain text; there's no picking out specific parts of a page.

---

## Team

Built at Cal Hacks 13.0 by:

- [Ellie Du](https://github.com/ellied07)
- [Huierpeng](https://github.com/huier2006-a11y)
