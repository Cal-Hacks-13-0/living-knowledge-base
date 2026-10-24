import { prisma } from "@/lib/db/prisma";
import type { NormalizedDocument } from "./normalizer";

/**
 * Stage 1 (mandatory for MVP): exact deduplication by canonical URL or content
 * hash within the same source. Stage 2 (semantic similarity via embeddings/LLM)
 * is P1 and not implemented — see README "Known limitations".
 */
export async function filterOutExactDuplicates(
  sourceId: string,
  docs: NormalizedDocument[]
): Promise<NormalizedDocument[]> {
  if (docs.length === 0) return [];

  const existing = await prisma.sourceDocument.findMany({
    where: {
      sourceId,
      OR: [
        { url: { in: docs.map((d) => d.url) } },
        { contentHash: { in: docs.map((d) => d.contentHash) } },
      ],
    },
    select: { url: true, contentHash: true },
  });

  const existingUrls = new Set(existing.map((e) => e.url));
  const existingHashes = new Set(existing.map((e) => e.contentHash));

  const fresh: NormalizedDocument[] = [];
  const seenInBatchUrls = new Set<string>();
  const seenInBatchHashes = new Set<string>();

  for (const doc of docs) {
    if (existingUrls.has(doc.url) || existingHashes.has(doc.contentHash)) continue;
    if (seenInBatchUrls.has(doc.url) || seenInBatchHashes.has(doc.contentHash)) continue;
    seenInBatchUrls.add(doc.url);
    seenInBatchHashes.add(doc.contentHash);
    fresh.push(doc);
  }
  return fresh;
}
