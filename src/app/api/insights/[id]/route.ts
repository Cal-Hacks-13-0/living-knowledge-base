import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError, NotFoundError } from "@/lib/api/response";
import { UpdateInsightRequestSchema } from "@/lib/validation/schemas";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.insight.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Insight not found: ${id}`);

    const body = UpdateInsightRequestSchema.parse(await req.json());
    const updated = await prisma.insight.update({ where: { id }, data: { status: body.status } });
    return ok(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
