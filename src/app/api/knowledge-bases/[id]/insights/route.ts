import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError } from "@/lib/api/response";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const status = req.nextUrl.searchParams.get("status");

    const insights = await prisma.insight.findMany({
      where: { knowledgeBaseId: id, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        evidence: {
          include: {
            sourceDocument: { select: { id: true, title: true, url: true } },
            knowledgeEntry: { select: { id: true, title: true } },
          },
        },
      },
    });
    return ok(insights);
  } catch (err) {
    return handleApiError(err);
  }
}
