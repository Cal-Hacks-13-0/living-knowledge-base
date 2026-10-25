import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError, NotFoundError } from "@/lib/api/response";
import { runResearch } from "@/lib/research/orchestrator";

// Vercel function time limit in seconds (a run fetches every source and makes up to 8 AI calls).
export const maxDuration = 300;

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
