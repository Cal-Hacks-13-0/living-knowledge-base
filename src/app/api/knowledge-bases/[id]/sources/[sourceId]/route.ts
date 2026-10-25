import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, fail, handleApiError, NotFoundError } from "@/lib/api/response";
import { UpdateSourceRequestSchema, validateUrl } from "@/lib/validation/schemas";
import { syncKnowledgeBaseToVaultSafe } from "@/lib/vault/sync";

/**
 * Replaces a source's address. Its previous error and cached etag no longer
 * apply, so they're cleared; the client then runs "Check again".
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; sourceId: string }> }) {
  try {
    const { id, sourceId } = await params;
    const body = UpdateSourceRequestSchema.parse(await req.json());
    const url = body.url.trim();
    const validation = validateUrl(url);
    if (!validation.ok) return fail(`Invalid URL: ${validation.error}`, 400);

    const source = await prisma.source.findFirst({ where: { id: sourceId, knowledgeBaseId: id } });
    if (!source) throw new NotFoundError(`Source not found: ${sourceId}`);
    if (url === source.url) return ok(source);

    const clash = await prisma.source.findUnique({ where: { knowledgeBaseId_url: { knowledgeBaseId: id, url } } });
    if (clash) return fail("Another source in this knowledge vault already uses that address.", 409);

    const updated = await prisma.source.update({
      where: { id: source.id },
      data: { url, lastError: null, etag: null, lastModified: null },
    });
    await syncKnowledgeBaseToVaultSafe(id);
    return ok(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
