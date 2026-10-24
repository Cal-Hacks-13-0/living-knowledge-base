import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError } from "@/lib/api/response";

/**
 * Cross-knowledge-base search over KnowledgeEntry. Same `contains` approach as
 * the per-KB /api/knowledge-bases/:id/entries?search= endpoint, just without
 * the knowledgeBaseId filter — see docs/architecture-handoff.md §4.
 */
export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get("q")?.trim();
    if (!search) return ok({ entries: [] });

    const entries = await prisma.knowledgeEntry.findMany({
      where: {
        OR: [
          { title: { contains: search } },
          { summary: { contains: search } },
          { content: { contains: search } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        knowledgeBase: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        sourceDocument: { select: { id: true, url: true, title: true } },
      },
    });

    return ok({ entries });
  } catch (err) {
    return handleApiError(err);
  }
}
