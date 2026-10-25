import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { extractKnowledge } from "./extraction-agent";
import { compareAgainstExisting } from "@/lib/knowledge/comparison";
import { applyComparisonClassification } from "@/lib/knowledge/classification";
import { fetchHtmlSource } from "@/lib/research/html-fetcher";
import { filterOutExactDuplicates } from "@/lib/research/deduplicator";
import { validateUrl } from "@/lib/validation/schemas";
import { syncKnowledgeBaseToVaultSafe } from "@/lib/vault/sync";
import { runResearch, OverlappingRunError } from "@/lib/research/orchestrator";
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

/** Builds the global tool definitions + dispatcher. Not bound to one KB. */
export function buildAssistantTools({
  onProposeKnowledgeBase,
}: {
  onProposeKnowledgeBase: (goal: string) => void;
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
  ];

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
    return `Unknown tool: ${name}`;
  }

  return { definitions, execute };
}
