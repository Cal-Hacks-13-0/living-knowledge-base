import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/api/response";
import { fetchFromSource } from "./orchestrator";

/**
 * "Check again" for one source: fetches it right now and records whether it
 * is reachable — without storing documents or touching its etag/last-modified,
 * so the next research run still picks up everything it finds.
 */
export async function checkSource(knowledgeBaseId: string, sourceId: string) {
  const source = await prisma.source.findFirst({ where: { id: sourceId, knowledgeBaseId } });
  if (!source) throw new NotFoundError(`Source not found: ${sourceId}`);

  try {
    // No conditional headers: a 304 would say nothing about whether the content is readable.
    const result = await fetchFromSource({ ...source, etag: null, lastModified: null });
    const now = new Date();
    const updated = await prisma.source.update({
      where: { id: source.id },
      data: { status: "ACTIVE", lastError: null, lastCheckedAt: now, lastSuccessfulFetchAt: now },
    });
    return { reachable: true as const, itemCount: result.documents.length, source: updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[sources] check of ${source.id} (${source.url}) failed:`, err);
    const updated = await prisma.source.update({
      where: { id: source.id },
      data: { status: "ERROR", lastError: message, lastCheckedAt: new Date() },
    });
    return { reachable: false as const, itemCount: 0, source: updated };
  }
}
