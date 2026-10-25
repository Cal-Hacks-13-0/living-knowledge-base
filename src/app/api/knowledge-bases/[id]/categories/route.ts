import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, fail, handleApiError, NotFoundError } from "@/lib/api/response";
import { CreateCategoryRequestSchema } from "@/lib/validation/schemas";
import { syncKnowledgeBaseToVaultSafe } from "@/lib/vault/sync";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const categories = await prisma.knowledgeCategory.findMany({
      where: { knowledgeBaseId: id, parentId: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { entries: true } } },
    });
    return ok(categories);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb) throw new NotFoundError(`Knowledge vault not found: ${id}`);

    const body = CreateCategoryRequestSchema.parse(await req.json());

    // Compound-unique findUnique doesn't accept null for a nullable key field
    // (SQL NULL has no equality match), so look it up with findFirst instead.
    const existing = await prisma.knowledgeCategory.findFirst({
      where: { knowledgeBaseId: id, name: body.name, parentId: null },
    });
    if (existing) return fail(`A category named "${body.name}" already exists.`, 409);

    const category = await prisma.knowledgeCategory.create({
      data: { knowledgeBaseId: id, name: body.name, description: body.description },
    });
    await syncKnowledgeBaseToVaultSafe(id);
    return ok(category, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
