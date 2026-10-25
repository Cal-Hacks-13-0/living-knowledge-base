import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError, NotFoundError } from "@/lib/api/response";
import { AssignEntryCategoryRequestSchema } from "@/lib/validation/schemas";
import { assignEntriesToCategory } from "@/lib/knowledge/categorize";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const search = req.nextUrl.searchParams.get("search")?.trim();
    const categoryId = req.nextUrl.searchParams.get("categoryId");

    const where: Prisma.KnowledgeEntryWhereInput = { knowledgeBaseId: id };
    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { summary: { contains: search } },
        { content: { contains: search } },
      ];
    }

    const entries = await prisma.knowledgeEntry.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        category: { select: { id: true, name: true } },
        sourceDocument: { select: { id: true, url: true, title: true } },
        insightEvidence: { include: { insight: { select: { id: true, title: true } } } },
      },
    });
    return ok(entries);
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Moves entries into a category of this knowledge vault (or back to
 * Uncategorized with `categoryId: null`) — single or bulk. Entries from
 * another vault are reported in `notFound` and left untouched; a category
 * from another vault is a 404. Drafts stay drafts; nothing else changes.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = AssignEntryCategoryRequestSchema.parse(await req.json());
    const kb = await prisma.knowledgeBase.findUnique({ where: { id }, select: { id: true } });
    if (!kb) throw new NotFoundError(`Knowledge vault not found: ${id}`);
    return ok(await assignEntriesToCategory({ knowledgeBaseId: id, entryIds: body.entryIds, categoryId: body.categoryId }));
  } catch (err) {
    return handleApiError(err);
  }
}
