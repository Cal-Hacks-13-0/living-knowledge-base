import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError, NotFoundError } from "@/lib/api/response";
import { syncKnowledgeBaseToVaultSafe } from "@/lib/vault/sync";

/**
 * Deletes a top-level category. Entries tagged with it fall back to
 * Uncategorized (Prisma's onDelete: SetNull on KnowledgeEntry.category) —
 * nothing is deleted except the category and its subtopics.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; categoryId: string }> }
) {
  try {
    const { id, categoryId } = await params;
    const category = await prisma.knowledgeCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.knowledgeBaseId !== id) {
      throw new NotFoundError(`Category not found: ${categoryId}`);
    }

    await prisma.$transaction([
      prisma.knowledgeCategory.deleteMany({ where: { parentId: categoryId } }),
      prisma.knowledgeCategory.delete({ where: { id: categoryId } }),
    ]);

    await syncKnowledgeBaseToVaultSafe(id);
    return ok({ id: categoryId });
  } catch (err) {
    return handleApiError(err);
  }
}
