import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/api/response";
import { syncKnowledgeBaseToVaultSafe } from "@/lib/vault/sync";
import type { Prisma } from "@prisma/client";

/**
 * Category assignment for knowledge entries — the one write path shared by
 * the Library (single + bulk "Move to category") and the AI Assistant's
 * categorize tool, so both enforce the same rules:
 *
 * - The destination category and every entry must belong to the given
 *   knowledge vault; ids from another vault are reported, never touched.
 * - Only `categoryId` changes. Status (DRAFT stays DRAFT), title, summary,
 *   content and source links are left exactly as they were.
 * - `categoryId: null` moves entries back to Uncategorized.
 * - Re-assigning to the category an entry already has is a no-op.
 *
 * Draft status and category are independent: drafts can be categorized
 * without being published.
 */
export interface CategoryAssignmentResult {
  category: { id: string; name: string } | null;
  /** Entries whose category actually changed. */
  updated: Array<{ id: string; title: string }>;
  /** Already in that category — nothing to do. */
  unchanged: Array<{ id: string; title: string }>;
  /** Ids that don't exist in this knowledge vault (wrong vault, deleted, or made up). */
  notFound: string[];
}

export const MAX_ENTRIES_PER_ASSIGNMENT = 200;

export async function assignEntriesToCategory({
  knowledgeBaseId,
  entryIds,
  categoryId,
}: {
  knowledgeBaseId: string;
  entryIds: string[];
  categoryId: string | null;
}): Promise<CategoryAssignmentResult> {
  const ids = [...new Set(entryIds)].slice(0, MAX_ENTRIES_PER_ASSIGNMENT);

  const category = categoryId
    ? await prisma.knowledgeCategory.findFirst({
        where: { id: categoryId, knowledgeBaseId },
        select: { id: true, name: true },
      })
    : null;
  if (categoryId && !category) {
    throw new NotFoundError(`Category not found in this knowledge vault: ${categoryId}`);
  }
  const target = category?.id ?? null;

  const found = await prisma.knowledgeEntry.findMany({
    where: { id: { in: ids }, knowledgeBaseId },
    select: { id: true, title: true, categoryId: true },
  });
  const foundIds = new Set(found.map((e) => e.id));
  const toUpdate = found.filter((e) => e.categoryId !== target);

  if (toUpdate.length > 0) {
    await prisma.knowledgeEntry.updateMany({
      // knowledgeBaseId repeated here so the write itself can never cross vaults.
      where: { id: { in: toUpdate.map((e) => e.id) }, knowledgeBaseId },
      data: { categoryId: target },
    });
    await syncKnowledgeBaseToVaultSafe(knowledgeBaseId);
  }

  return {
    category,
    updated: toUpdate.map(({ id, title }) => ({ id, title })),
    unchanged: found.filter((e) => e.categoryId === target).map(({ id, title }) => ({ id, title })),
    notFound: ids.filter((id) => !foundIds.has(id)),
  };
}

/** Top-level categories (the structure shown in the Library) with live entry counts. */
export async function listVaultCategories(knowledgeBaseId: string) {
  const categories = await prisma.knowledgeCategory.findMany({
    where: { knowledgeBaseId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true, parentId: true, _count: { select: { entries: true } } },
  });
  const topLevel = categories.filter((c) => !c.parentId);
  // Entries filed under a subtopic count toward (and are shown under) their top-level category.
  const childCounts = new Map<string, number>();
  for (const c of categories) {
    if (c.parentId) childCounts.set(c.parentId, (childCounts.get(c.parentId) ?? 0) + c._count.entries);
  }
  const uncategorized = await prisma.knowledgeEntry.count({ where: { knowledgeBaseId, categoryId: null } });
  return {
    categories: topLevel.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      entryCount: c._count.entries + (childCounts.get(c.id) ?? 0),
    })),
    uncategorized,
  };
}

export type EntryFilter = "all" | "uncategorized" | { categoryId: string };

export const ENTRY_PAGE_SIZE = 25;

/**
 * One page of a vault's entries — drafts included — in a stable order
 * (oldest first, then id) with an opaque cursor, so a caller can walk every
 * entry without loading them all at once.
 */
export async function listEntriesPage({
  knowledgeBaseId,
  filter = "all",
  cursor,
  limit = ENTRY_PAGE_SIZE,
}: {
  knowledgeBaseId: string;
  filter?: EntryFilter;
  cursor?: string | null;
  limit?: number;
}) {
  const where: Prisma.KnowledgeEntryWhereInput = { knowledgeBaseId };
  if (filter === "uncategorized") where.categoryId = null;
  else if (typeof filter === "object") where.categoryId = filter.categoryId;

  const take = Math.min(Math.max(limit, 1), 50);
  const [total, rows] = await Promise.all([
    prisma.knowledgeEntry.count({ where }),
    prisma.knowledgeEntry.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        category: { select: { id: true, name: true } },
        sourceDocument: { select: { url: true, source: { select: { name: true } } } },
      },
    }),
  ]);
  const hasMore = rows.length > take;
  const entries = rows.slice(0, take);
  return { total, entries, nextCursor: hasMore ? entries[entries.length - 1].id : null };
}

/** Full details of one entry in the vault, for classifying it accurately. */
export async function getEntryDetails(knowledgeBaseId: string, entryId: string) {
  return prisma.knowledgeEntry.findFirst({
    where: { id: entryId, knowledgeBaseId },
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      status: true,
      category: { select: { id: true, name: true } },
      sourceDocument: { select: { title: true, url: true, content: true, source: { select: { name: true } } } },
    },
  });
}
