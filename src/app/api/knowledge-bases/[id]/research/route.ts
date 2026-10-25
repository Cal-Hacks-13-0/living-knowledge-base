import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError, NotFoundError } from "@/lib/api/response";
import { runResearch } from "@/lib/research/orchestrator";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb) throw new NotFoundError(`Knowledge vault not found: ${id}`);

    const run = await runResearch(id, { trigger: "manual" });
    return ok(run);
  } catch (err) {
    return handleApiError(err);
  }
}
