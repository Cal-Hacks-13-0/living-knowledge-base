import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError } from "@/lib/api/response";
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
