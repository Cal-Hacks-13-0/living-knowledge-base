import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/api/response";
import { rejectProposal } from "@/lib/knowledge/versioning";
import { syncKnowledgeBaseToVaultSafe } from "@/lib/vault/sync";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const proposal = await rejectProposal(id);
    await syncKnowledgeBaseToVaultSafe(proposal.knowledgeBaseId);
    return ok(proposal);
  } catch (err) {
    return handleApiError(err);
  }
}
