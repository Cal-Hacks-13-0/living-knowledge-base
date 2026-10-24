import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError, NotFoundError } from "@/lib/api/response";
import { syncKnowledgeBaseToVault } from "@/lib/vault/sync";

/** Manual resync trigger — the vault is kept in sync automatically after every
 * mutation, this is a safety-net / "force refresh" button. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb) throw new NotFoundError(`Knowledge base not found: ${id}`);

    const vaultPath = await syncKnowledgeBaseToVault(id);
    return ok({ vaultPath });
  } catch (err) {
    return handleApiError(err);
  }
}
