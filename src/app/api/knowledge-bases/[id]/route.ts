import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError, NotFoundError } from "@/lib/api/response";
import { UpdateKnowledgeBaseRequestSchema } from "@/lib/validation/schemas";
import { syncJobForKnowledgeBase, unscheduleKnowledgeBase } from "@/lib/jobs/scheduler";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id },
      include: {
        categories: true,
        _count: { select: { sources: true, entries: true, insights: true } },
        researchRuns: { orderBy: { startedAt: "desc" }, take: 1 },
      },
    });
    if (!kb) throw new NotFoundError(`Knowledge base not found: ${id}`);

    const pendingInsights = await prisma.insight.count({
      where: { knowledgeBaseId: id, status: "PENDING" },
    });
    const pendingProposals = await prisma.knowledgeChangeProposal.count({
      where: { knowledgeBaseId: id, status: "PENDING" },
    });

    return ok({ ...kb, pendingInsights, pendingProposals });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.knowledgeBase.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Knowledge base not found: ${id}`);

    const body = UpdateKnowledgeBaseRequestSchema.parse(await req.json());
    const updated = await prisma.knowledgeBase.update({ where: { id }, data: body });

    if (body.monitoringFrequency) {
      if (body.monitoringFrequency === "MANUAL") {
        unscheduleKnowledgeBase(id);
      } else {
        syncJobForKnowledgeBase(id, body.monitoringFrequency);
      }
    }

    return ok(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
