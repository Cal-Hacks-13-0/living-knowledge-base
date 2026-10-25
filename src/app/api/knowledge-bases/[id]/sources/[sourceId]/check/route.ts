import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/api/response";
import { checkSource } from "@/lib/research/check-source";
import { syncKnowledgeBaseToVaultSafe } from "@/lib/vault/sync";

/** Re-checks one source now (fetch only — no documents stored, no AI). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; sourceId: string }> }) {
  try {
    const { id, sourceId } = await params;
    const result = await checkSource(id, sourceId);
    await syncKnowledgeBaseToVaultSafe(id);
    return ok(result);
  } catch (err) {
    return handleApiError(err);
  }
}
