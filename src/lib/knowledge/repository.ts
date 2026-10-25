import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export async function getKnowledgeBaseOrThrow(id: string) {
  const kb = await prisma.knowledgeBase.findUnique({
    where: { id },
    include: { categories: true },
  });
  if (!kb) throw new Error(`Knowledge vault not found: ${id}`);
  return kb;
}

/** Every source except ones the user has explicitly paused. ERROR sources are
 * retried (that's how a transient failure recovers); PAUSED ones are skipped. */
export async function listMonitorableSources(knowledgeBaseId: string) {
  return prisma.source.findMany({
    where: { knowledgeBaseId, status: { not: "PAUSED" } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Finds existing knowledge entries most likely relevant to a new finding, using
 * simple keyword overlap over title/summary/content. No embeddings in the MVP
 * (P1 — see README); this keeps the Comparison/Insight agents grounded in a
 * bounded, relevant slice of existing knowledge instead of the whole KB.
 */
export async function findRelevantEntries(
  knowledgeBaseId: string,
  topics: string[],
  limit = 8
) {
  const keywords = topics.filter((t) => t && t.trim().length > 1).slice(0, 8);

  if (keywords.length > 0) {
    const where: Prisma.KnowledgeEntryWhereInput = {
      knowledgeBaseId,
      OR: keywords.flatMap((kw) => [
        { title: { contains: kw } },
        { summary: { contains: kw } },
        { content: { contains: kw } },
      ]),
    };
    const matched = await prisma.knowledgeEntry.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    if (matched.length > 0) return matched;
  }

  // Fall back to the most recently touched entries so the comparison agent
  // still has some context even without a keyword match.
  return prisma.knowledgeEntry.findMany({
    where: { knowledgeBaseId },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

export async function matchCategoryByTopics(knowledgeBaseId: string, topics: string[]) {
  if (topics.length === 0) return null;
  // Only match against top-level categories — the structure the user confirmed
  // at setup (or edited later from the Library tab). Matching against
  // subtopics too caused entries to get tagged with categories that don't
  // appear anywhere in the Library's category list/filter, which looked like
  // the categorization was randomly inconsistent with what was set up.
  const categories = await prisma.knowledgeCategory.findMany({ where: { knowledgeBaseId, parentId: null } });
  const lowerTopics = topics.map((t) => t.toLowerCase());
  for (const category of categories) {
    const name = category.name.toLowerCase();
    if (lowerTopics.some((t) => name.includes(t) || t.includes(name))) {
      return category;
    }
  }
  return null;
}

/** The vault's top-level categories, as offered to the Extraction Agent. */
export async function listCategoryChoices(knowledgeBaseId: string) {
  return prisma.knowledgeCategory.findMany({
    where: { knowledgeBaseId, parentId: null },
    orderBy: { name: "asc" },
    select: { name: true, description: true },
  });
}

/**
 * The category a new entry is filed under: the existing top-level category
 * the Extraction Agent named (exact name, case-insensitive), else a
 * topic/name match. Anything else — including a name that doesn't exist —
 * leaves it Uncategorized rather than creating a category.
 */
export async function resolveEntryCategory(knowledgeBaseId: string, extraction: { category?: string | null; topics: string[] }) {
  const wanted = extraction.category?.trim().toLowerCase();
  if (wanted) {
    const categories = await prisma.knowledgeCategory.findMany({ where: { knowledgeBaseId, parentId: null } });
    const exact = categories.find((c) => c.name.trim().toLowerCase() === wanted);
    if (exact) return exact;
  }
  return matchCategoryByTopics(knowledgeBaseId, extraction.topics);
}

export async function createDraftEntry(input: {
  knowledgeBaseId: string;
  categoryId: string | null;
  title: string;
  summary: string;
  content: string;
  sourceDocumentId: string;
}) {
  return prisma.knowledgeEntry.create({
    data: {
      knowledgeBaseId: input.knowledgeBaseId,
      categoryId: input.categoryId,
      title: input.title.slice(0, 300),
      summary: input.summary,
      content: input.content,
      sourceDocumentId: input.sourceDocumentId,
      status: "DRAFT",
    },
  });
}
