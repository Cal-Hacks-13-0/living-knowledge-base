import { prisma } from "@/lib/db/prisma";
import type { NormalizedDocument } from "./normalizer";

/**
 * Stage 1 (mandatory for MVP): exact deduplication by canonical URL or content
 * hash within the same source. Stage 2 (semantic similarity via embeddings/LLM)
 * is P1 and not implemented — see README "Known limitations".
 *
 * URL-based skipping only applies to documents with a stable item identity
 * (`externalId` — an RSS item's guid/link, a specific GitHub release): if
 * we've already stored that exact item, it's safe to skip regardless of
 * minor content drift. HTML-scraped sources have no such identity
 * (`externalId: null`, see html-fetcher.ts) — their "document" is a snapshot
 * of the configured page, refetched at the *same* URL every run. Without
 * this distinction, a URL match alone would skip every HTML source's
 * document on every run after the first, forever, even when the page's
 * actual content changed — the AI pipeline would never see it again. For
 * those, only an exact content-hash match (nothing actually changed) is
 * grounds to skip.
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
    const hasStableIdentity = doc.externalId !== null;
    if (hasStableIdentity && (existingUrls.has(doc.url) || seenInBatchUrls.has(doc.url))) continue;
    if (existingHashes.has(doc.contentHash) || seenInBatchHashes.has(doc.contentHash)) continue;
    if (hasStableIdentity) seenInBatchUrls.add(doc.url);
    seenInBatchHashes.add(doc.contentHash);
    fresh.push(doc);
  }
  return fresh;
}
