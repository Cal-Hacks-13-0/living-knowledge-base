import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError } from "@/lib/api/response";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const status = req.nextUrl.searchParams.get("status");
    const proposals = await prisma.knowledgeChangeProposal.findMany({
      where: { knowledgeBaseId: id, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        targetEntry: { select: { id: true, title: true, summary: true, content: true, status: true } },
        insight: { select: { id: true, title: true } },
      },
    });
    return ok(proposals);
  } catch (err) {
    return handleApiError(err);
  }
}
