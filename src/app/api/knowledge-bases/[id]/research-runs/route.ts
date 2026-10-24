import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError } from "@/lib/api/response";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const runs = await prisma.researchRun.findMany({
      where: { knowledgeBaseId: id },
      orderBy: { startedAt: "desc" },
      take: 25,
    });
    return ok(runs);
  } catch (err) {
    return handleApiError(err);
  }
}
