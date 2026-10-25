import { prisma } from "@/lib/db/prisma";

/**
 * Global search behind the Search page (GET /api/search). Matches knowledge
 * vaults by name/description and knowledge entries by title, summary, and
 * full stored content — everything stays server-side; only capped result
 * lists with short snippets go to the browser.
 *
 * Single-user local mode (README §5/§7): there's no auth or per-user scoping
 * in this app, so "the user's data" is everything in the local database.
 * Matching is SQLite LIKE via Prisma `contains`, which is case-insensitive for
 * ASCII letters. Raw fetched source documents aren't searched — only the
 * knowledge entries extracted from them.
 */

export const SEARCH_QUERY_MAX_LENGTH = 200;
const VAULT_LIMIT = 10;
const ENTRY_LIMIT = 30;
const SNIPPET_RADIUS = 80;

export interface VaultSearchResult {
  id: string;
  name: string;
  snippet: string;
  entryCount: number;
}

export interface EntrySearchResult {
  id: string;
  title: string;
  summary: string;
  snippet: string;
  status: string;
  updatedAt: Date;
  knowledgeBase: { id: string; name: string };
  category: { id: string; name: string } | null;
  sourceDocument: { id: string; url: string; title: string } | null;
}

export async function searchKnowledge(rawQuery: string): Promise<{ vaults: VaultSearchResult[]; entries: EntrySearchResult[] }> {
  const query = rawQuery.trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
  if (!query) return { vaults: [], entries: [] };

  const [vaults, entries] = await Promise.all([
    prisma.knowledgeBase.findMany({
      where: { OR: [{ name: { contains: query } }, { description: { contains: query } }] },
      orderBy: { updatedAt: "desc" },
      take: VAULT_LIMIT,
      select: { id: true, name: true, description: true, _count: { select: { entries: true } } },
    }),
    prisma.knowledgeEntry.findMany({
      where: {
        OR: [{ title: { contains: query } }, { summary: { contains: query } }, { content: { contains: query } }],
      },
      orderBy: { updatedAt: "desc" },
      take: ENTRY_LIMIT,
      select: {
        id: true,
        title: true,
        summary: true,
        content: true,
        status: true,
        updatedAt: true,
        knowledgeBase: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        sourceDocument: { select: { id: true, url: true, title: true } },
      },
    }),
  ]);

  return {
    vaults: vaults.map((kb) => ({
      id: kb.id,
      name: kb.name,
      snippet: makeSnippet(kb.description, query),
      entryCount: kb._count.entries,
    })),
    entries: entries.map(({ content, ...entry }) => ({
      ...entry,
      // Prefer showing where the match is; fall back to the summary for title-only matches.
      snippet: findIn(entry.summary, query) >= 0 || findIn(content, query) < 0
        ? makeSnippet(entry.summary, query)
        : makeSnippet(content, query),
    })),
  };
}

function findIn(text: string, query: string): number {
  return text.toLowerCase().indexOf(query.toLowerCase());
}

/** A short, whitespace-collapsed excerpt centred on the first match (or the start of the text). */
export function makeSnippet(text: string, query: string, radius = SNIPPET_RADIUS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = findIn(flat, query);
  if (at < 0) return flat.length > radius * 2 ? `${flat.slice(0, radius * 2).trimEnd()}…` : flat;
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + query.length + radius);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`;
}
