import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { extractKnowledge } from "./extraction-agent";
import { compareAgainstExisting } from "@/lib/knowledge/comparison";
import { applyComparisonClassification } from "@/lib/knowledge/classification";
import { fetchHtmlSource } from "@/lib/research/html-fetcher";
import { filterOutExactDuplicates } from "@/lib/research/deduplicator";
import { validateUrl } from "@/lib/validation/schemas";
import { listCategoryChoices } from "@/lib/knowledge/repository";
import { syncKnowledgeBaseToVaultSafe } from "@/lib/vault/sync";
import { runResearch, OverlappingRunError } from "@/lib/research/orchestrator";
import {
  assignEntriesToCategory,
  getEntryDetails,
  listEntriesPage,
  listVaultCategories,
  ENTRY_PAGE_SIZE,
} from "@/lib/knowledge/categorize";
import { NotFoundError } from "@/lib/api/response";
import type { ToolDefinition } from "./client";

/**
 * Tools the global AI Assistant chat can call. Unlike the old per-KB
 * version, `knowledgeBaseId` is now an input the model itself supplies
 * (it's given the list of existing KBs in its context) rather than bound by
 * closure — the assistant operates across every knowledge base the user has.
 */

// Ad-hoc chat-fetched pages all parent under one per-KB "virtual" source so
// SourceDocument's required sourceId FK is satisfied. It's created PAUSED so
// the research scheduler / "Run Research Now" never tries to fetch its
// placeholder URL.
const CHAT_ARCHIVE_SOURCE_URL = "internal://ai-assistant-archive";

async function getOrCreateChatArchiveSource(knowledgeBaseId: string) {
  const existing = await prisma.source.findUnique({
    where: { knowledgeBaseId_url: { knowledgeBaseId, url: CHAT_ARCHIVE_SOURCE_URL } },
  });
  if (existing) return existing;
  return prisma.source.create({
    data: {
      knowledgeBaseId,
      name: "Links added via AI Assistant",
      url: CHAT_ARCHIVE_SOURCE_URL,
      type: "HTML",
      status: "PAUSED",
    },
  });
}

/** Returns null (never throws) so callers can report a friendly tool_result
 * instead of an uncaught error when the model names a bad id. */
async function resolveKnowledgeBase(knowledgeBaseId: string) {
  return prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
}

async function unknownKnowledgeBaseMessage(knowledgeBaseId: string): Promise<string> {
  const all = await prisma.knowledgeBase.findMany({ select: { id: true, name: true } });
  const list = all.map((k) => `${k.name} (${k.id})`).join(", ") || "(none exist yet)";
  return `No knowledge base matches "${knowledgeBaseId}". Existing ones: ${list}`;
}

export async function fetchAndArchiveUrl(knowledgeBaseId: string, rawUrl: string): Promise<string> {
  const validation = validateUrl(rawUrl);
  if (!validation.ok) return `I can't fetch that: ${validation.error}`;

  const kb = await resolveKnowledgeBase(knowledgeBaseId);
  if (!kb) return unknownKnowledgeBaseMessage(knowledgeBaseId);
  const source = await getOrCreateChatArchiveSource(kb.id);

  let result;
  try {
    result = await fetchHtmlSource(rawUrl);
  } catch (err) {
    return `I couldn't fetch that URL: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (result.notModified || result.documents.length === 0) {
    return "I fetched that page but found no readable text content to archive.";
  }
  const doc = result.documents[0];

  const fresh = await filterOutExactDuplicates(source.id, [doc]);
  if (fresh.length === 0) {
    return `"${doc.title}" is already archived in "${kb.name}" — nothing new to add.`;
  }

  const stored = await prisma.sourceDocument.create({
    data: {
      sourceId: source.id,
      url: doc.url,
      title: doc.title,
      content: doc.content,
      contentHash: doc.contentHash,
      publishedAt: doc.publishedAt,
    },
  });

  const extraction = await extractKnowledge({
    knowledgeBaseGoal: kb.userGoal,
    title: doc.title,
    url: doc.url,
    content: doc.content,
    categories: await listCategoryChoices(kb.id),
  });

  if (!extraction.isRelevant) {
    await syncKnowledgeBaseToVaultSafe(kb.id);
    return `I fetched "${doc.title}" and saved the raw page, but it doesn't look relevant to "${kb.name}"'s goal ("${kb.userGoal}"), so I didn't create a knowledge entry from it.`;
  }

  const { comparison } = await compareAgainstExisting(kb.id, extraction);
  const outcome = await applyComparisonClassification({
    knowledgeBaseId: kb.id,
    title: doc.title,
    extraction,
    comparison,
    sourceDocumentId: stored.id,
    origin: "assistant_archive",
  });

  await syncKnowledgeBaseToVaultSafe(kb.id);

  switch (outcome.action) {
    case "duplicate":
      return `I fetched "${doc.title}" — it says the same thing as something already stored in "${kb.name}", so I didn't add a duplicate.`;
    case "created_entry":
      return `Archived "${outcome.title}" as a new knowledge entry in "${kb.name}"${
        outcome.categoryName ? ` under "${outcome.categoryName}"` : ""
      }. ${comparison.explanation}`;
    case "created_proposal":
      return `"${doc.title}" ${outcome.operation === "CONTRADICTION" ? "conflicts with" : "may update"} ${
        outcome.targetEntryTitle ? `"${outcome.targetEntryTitle}"` : "an existing entry"
      } in "${kb.name}" — I created a proposal in its Insights tab for you to review rather than changing it automatically. ${comparison.explanation}`;
  }
}

export async function runResearchNow(knowledgeBaseId: string): Promise<string> {
  const kb = await resolveKnowledgeBase(knowledgeBaseId);
  if (!kb) return unknownKnowledgeBaseMessage(knowledgeBaseId);
  try {
    const run = await runResearch(kb.id, { trigger: "manual" });
    return `Research run on "${kb.name}" ${run.status.toLowerCase()} — fetched ${run.documentsFetched} document(s), processed ${run.documentsProcessed}, generated ${run.insightsGenerated} new insight(s).`;
  } catch (err) {
    if (err instanceof OverlappingRunError) {
      return `A research run is already in progress for "${kb.name}" — I'll need to wait for it to finish before starting another.`;
    }
    return `The research run on "${kb.name}" failed to start: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const FetchAndArchiveUrlSchema = z.object({
  url: z.string().describe("The exact http(s) URL to fetch and consider archiving."),
  knowledgeBaseId: z.string().describe("The id of the knowledge base to archive this into."),
});

const RunResearchNowSchema = z.object({
  knowledgeBaseId: z.string().describe("The id of the knowledge base to run research on."),
});

export const ProposeNewKnowledgeBaseSchema = z.object({
  goal: z
    .string()
    .describe(
      "A clear, specific one-sentence goal for the new knowledge base, phrased the way a user would type it to start onboarding — e.g. \"I want to build a knowledge base about X.\""
    ),
});

// --- Entry organization tools (scoped to the vault the user is viewing) ------

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}… [truncated — use get_entry for the full text]` : text);

export async function listCategoriesTool(knowledgeBaseId: string): Promise<string> {
  const { categories, uncategorized } = await listVaultCategories(knowledgeBaseId);
  if (categories.length === 0) return `This knowledge vault has no categories yet. Uncategorized entries: ${uncategorized}.`;
  return [
    `Categories in this knowledge vault (id | name | entries | description):`,
    ...categories.map((c) => `- ${c.id} | ${c.name} | ${c.entryCount} | ${c.description || "(no description)"}`),
    `Uncategorized entries: ${uncategorized}.`,
  ].join("\n");
}

export async function listEntriesTool(
  knowledgeBaseId: string,
  input: { filter: "all" | "uncategorized" | "category"; categoryId?: string; cursor?: string }
): Promise<string> {
  if (input.filter === "category" && !input.categoryId) return "filter \"category\" needs a categoryId.";
  const filter = input.filter === "category" ? { categoryId: input.categoryId! } : input.filter;
  let page;
  try {
    page = await listEntriesPage({ knowledgeBaseId, filter, cursor: input.cursor ?? null });
  } catch {
    return "That cursor isn't valid for this list — start again without a cursor.";
  }
  const label = input.filter === "uncategorized" ? "uncategorized entries" : input.filter === "category" ? "entries in that category" : "entries";
  if (page.total === 0) return `There are no ${label} in this knowledge vault.`;
  const lines = page.entries.map(
    (e) =>
      `- id=${e.id} | ${e.status} | category: ${e.category?.name ?? "Uncategorized"} | source: ${e.sourceDocument?.source.name ?? "none"}${
        e.sourceDocument ? ` (${e.sourceDocument.url})` : ""
      }\n  title: ${e.title}\n  summary: ${clip(e.summary, 400)}`
  );
  return [
    `This page has ${page.entries.length} of ${page.total} ${label} (drafts included; stable order).`,
    ...lines,
    page.nextCursor
      ? `MORE ENTRIES REMAIN — call list_entries again with cursor="${page.nextCursor}" to see the next page. You have NOT seen all ${page.total} yet.`
      : `End of list — every one of the ${page.total} ${label} has now been listed (across all pages).`,
  ].join("\n");
}

export async function getEntryTool(knowledgeBaseId: string, entryId: string): Promise<string> {
  const e = await getEntryDetails(knowledgeBaseId, entryId);
  if (!e) return `No entry with id ${entryId} in this knowledge vault.`;
  return [
    `id=${e.id} | ${e.status} | category: ${e.category?.name ?? "Uncategorized"}`,
    `title: ${e.title}`,
    `summary: ${e.summary}`,
    `content: ${clip(e.content, 4000)}`,
    e.sourceDocument
      ? `source: ${e.sourceDocument.source.name} — ${e.sourceDocument.title} (${e.sourceDocument.url})\nsource excerpt: ${clip(e.sourceDocument.content, 2000)}`
      : "source: none",
  ].join("\n");
}

export async function assignEntriesTool(
  knowledgeBaseId: string,
  input: { categoryId: string | null; entryIds: string[] }
): Promise<string> {
  let result;
  try {
    result = await assignEntriesToCategory({ knowledgeBaseId, entryIds: input.entryIds, categoryId: input.categoryId });
  } catch (err) {
    if (err instanceof NotFoundError) return `FAILED — nothing was changed: ${err.message}. Call list_categories for valid ids.`;
    return `FAILED — nothing was changed: ${err instanceof Error ? err.message : String(err)}`;
  }
  const where = result.category ? `"${result.category.name}"` : "Uncategorized";
  const out = [`Saved. Category set to ${where} for ${result.updated.length} entr${result.updated.length === 1 ? "y" : "ies"}.`];
  if (result.updated.length) out.push(`Moved: ${result.updated.map((e) => `"${e.title}"`).join("; ")}`);
  if (result.unchanged.length) out.push(`Already in ${where} (no change): ${result.unchanged.map((e) => `"${e.title}"`).join("; ")}`);
  if (result.notFound.length) out.push(`NOT changed — not entries of this knowledge vault: ${result.notFound.join(", ")}`);
  out.push("Status, content and sources were not modified.");
  return out.join("\n");
}

const ListEntriesSchema = z.object({
  filter: z
    .enum(["all", "uncategorized", "category"])
    .describe('Which entries: "all", "uncategorized" (no category), or "category" (one category — give categoryId).'),
  categoryId: z.string().optional().describe('Required when filter is "category".'),
  cursor: z.string().optional().describe("The cursor from the previous page's result, to get the next page."),
});
const GetEntrySchema = z.object({ entryId: z.string().describe("The entry id from list_entries.") });
const AssignEntriesSchema = z.object({
  categoryId: z
    .string()
    .nullable()
    .describe("Destination category id from list_categories, or null to move the entries back to Uncategorized."),
  entryIds: z.array(z.string()).min(1).max(50).describe("Entry ids from list_entries (all going to this one category)."),
});

/**
 * Builds the global tool definitions + dispatcher. URL archiving and
 * research take a knowledgeBaseId from the model; the entry-organization
 * tools only ever act on `currentKnowledgeBaseId` (the vault the user is
 * viewing), so the model can't reach into another vault with them.
 */
export function buildAssistantTools({
  onProposeKnowledgeBase,
  currentKnowledgeBaseId = null,
  onChange,
}: {
  onProposeKnowledgeBase: (goal: string) => void;
  currentKnowledgeBaseId?: string | null;
  /** Called with each persisted change (a short description), for honest reporting. */
  onChange?: (summary: string) => void;
}): {
  definitions: ToolDefinition[];
  execute: (name: string, input: unknown) => Promise<string>;
} {
  const definitions: ToolDefinition[] = [
    {
      name: "fetch_and_archive_url",
      description:
        "Fetches a URL the user shared and, if it's relevant, archives it into the given knowledge base: creates a new knowledge entry, or — if it conflicts with or might update something already stored — creates a change proposal for the user to review instead of overwriting anything automatically. Use this whenever the user pastes/mentions a link and wants it added to one of their existing knowledge bases.",
      inputSchema: FetchAndArchiveUrlSchema,
    },
    {
      name: "run_research_now",
      description:
        "Runs a full research pass on the given knowledge base's configured sources right now (the same thing the 'Run Research Now' button does) — fetches new content, extracts and compares it against existing knowledge, and generates insights. Use this when the user asks to check for updates, fetch the latest content, or refresh a specific knowledge base. This can take up to a minute or two.",
      inputSchema: RunResearchNowSchema,
    },
    {
      name: "propose_new_knowledge_base",
      description:
        "Call this when the user wants to START A NEW knowledge base (not add to an existing one) — e.g. they describe a new topic/goal they want tracked that isn't one of their existing knowledge bases. This does not create anything itself; it shows the user a confirmation card they can click to jump into the knowledge-base creation flow with their goal pre-filled, so they don't have to retype it. Never create a knowledge base any other way — there is no tool for that, only this proposal step.",
      inputSchema: ProposeNewKnowledgeBaseSchema,
    },
    {
      name: "list_categories",
      description:
        "Lists the categories of the knowledge vault the user is currently viewing (ids, names, descriptions, entry counts) and how many entries are uncategorized. Read-only.",
      inputSchema: z.object({}),
    },
    {
      name: "list_entries",
      description: `Lists knowledge entries of the vault the user is currently viewing — drafts included — ${ENTRY_PAGE_SIZE} per page with stable ids, category, source and a summary. Paginated: if the result says more entries remain, call again with the given cursor until it says "End of list". Read-only.`,
      inputSchema: ListEntriesSchema,
    },
    {
      name: "get_entry",
      description:
        "Full details of one entry in the current vault: complete summary and content, its source, and an excerpt of the source document. Use when a summary is truncated or too thin to classify confidently. Read-only.",
      inputSchema: GetEntrySchema,
    },
    {
      name: "assign_entries_to_category",
      description:
        "Saves a category assignment: moves the given entries (of the vault the user is currently viewing) into one existing category, or back to Uncategorized with categoryId null. Only the category changes — drafts stay drafts, nothing is published, rewritten or deleted. ONLY call this when the user explicitly asks you to move / assign / organize / categorize entries — never for a request that only asks for suggestions. Call once per destination category. The result is what was actually saved.",
      inputSchema: AssignEntriesSchema,
    },
  ];

  const needsVault = () =>
    "I can only organize entries in the knowledge vault the user is currently viewing, and they aren't viewing one. Ask them to open that vault and try again.";

  async function execute(name: string, input: unknown): Promise<string> {
    if (name === "fetch_and_archive_url") {
      const parsed = FetchAndArchiveUrlSchema.safeParse(input);
      if (!parsed.success) return `Invalid tool input: ${parsed.error.message}`;
      return fetchAndArchiveUrl(parsed.data.knowledgeBaseId, parsed.data.url);
    }
    if (name === "run_research_now") {
      const parsed = RunResearchNowSchema.safeParse(input);
      if (!parsed.success) return `Invalid tool input: ${parsed.error.message}`;
      return runResearchNow(parsed.data.knowledgeBaseId);
    }
    if (name === "propose_new_knowledge_base") {
      const parsed = ProposeNewKnowledgeBaseSchema.safeParse(input);
      if (!parsed.success) return `Invalid tool input: ${parsed.error.message}`;
      onProposeKnowledgeBase(parsed.data.goal);
      return "A confirmation card was shown to the user with this goal — they can click it to start creating the knowledge base. Don't claim it was already created.";
    }
    if (name === "list_categories" || name === "list_entries" || name === "get_entry" || name === "assign_entries_to_category") {
      if (!currentKnowledgeBaseId) return needsVault();
      const kb = await resolveKnowledgeBase(currentKnowledgeBaseId);
      if (!kb) return needsVault();
      if (name === "list_categories") return listCategoriesTool(kb.id);
      if (name === "list_entries") {
        const parsed = ListEntriesSchema.safeParse(input);
        if (!parsed.success) return `Invalid tool input: ${parsed.error.message}`;
        return listEntriesTool(kb.id, parsed.data);
      }
      if (name === "get_entry") {
        const parsed = GetEntrySchema.safeParse(input);
        if (!parsed.success) return `Invalid tool input: ${parsed.error.message}`;
        return getEntryTool(kb.id, parsed.data.entryId);
      }
      const parsed = AssignEntriesSchema.safeParse(input);
      if (!parsed.success) return `Invalid tool input: ${parsed.error.message}`;
      const result = await assignEntriesTool(kb.id, parsed.data);
      if (result.startsWith("Saved.")) onChange?.(result.split("\n").slice(0, 2).join(" "));
      return result;
    }
    return `Unknown tool: ${name}`;
  }

  return { definitions, execute };
}
