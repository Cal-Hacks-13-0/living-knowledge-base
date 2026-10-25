import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";
import { filterOutExactDuplicates } from "@/lib/research/deduplicator";
import { buildNormalizedDocument } from "@/lib/research/normalizer";

async function makeSource(kbId: string, url = "https://example.com/feed.xml") {
  return prisma.source.create({ data: { knowledgeBaseId: kbId, name: "Feed", url, type: "RSS" } });
}

describe("filterOutExactDuplicates", () => {
  beforeEach(resetDb);
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("drops an item with a stable identity (RSS guid/GitHub release) once its URL has been stored, even if content drifted", async () => {
    // Mirrors a real RSS/GitHub item: externalId set, URL uniquely identifies
    // the item. Re-processing the same item on every run (e.g. a lightly
    // edited post) would be noise, so URL alone is enough to skip it.
    const kb = await createTestKnowledgeBase();
    const source = await makeSource(kb.id);
    const existingDoc = buildNormalizedDocument({
      externalId: "guid-1",
      url: "https://example.com/posts/1",
      title: "Post 1",
      content: "Original content",
    });
    await prisma.sourceDocument.create({
      data: {
        sourceId: source.id,
        externalId: existingDoc.externalId,
        url: existingDoc.url,
        title: existingDoc.title,
        content: existingDoc.content,
        contentHash: existingDoc.contentHash,
      },
    });

    const sameItemEdited = buildNormalizedDocument({
      externalId: "guid-1",
      url: "https://example.com/posts/1",
      title: "Post 1 (edited)",
      content: "Totally different content this time",
    });
    const genuinelyNew = buildNormalizedDocument({
      externalId: "guid-2",
      url: "https://example.com/posts/2",
      title: "Post 2",
      content: "Brand new content",
    });

    const fresh = await filterOutExactDuplicates(source.id, [sameItemEdited, genuinelyNew]);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].url).toBe(genuinelyNew.url);
  });

  it("drops a document whose exact content was already stored, regardless of URL", async () => {
    const kb = await createTestKnowledgeBase();
    const source = await makeSource(kb.id);
    const existingDoc = buildNormalizedDocument({
      url: "https://example.com/posts/1",
      title: "Post 1",
      content: "Original content",
    });
    await prisma.sourceDocument.create({
      data: {
        sourceId: source.id,
        url: existingDoc.url,
        title: existingDoc.title,
        content: existingDoc.content,
        contentHash: existingDoc.contentHash,
      },
    });

    const sameContentDifferentUrl = buildNormalizedDocument({
      url: "https://example.com/posts/1-mirror",
      title: "Post 1 mirror",
      content: "Original content",
    });
    const fresh = await filterOutExactDuplicates(source.id, [sameContentDifferentUrl]);
    expect(fresh).toHaveLength(0);
  });

  it("re-processes an HTML page snapshot (no stable identity) when its content changed, even though the URL repeats — the bug this test guards against", async () => {
    // fetchHtmlSource always refetches the same configured page URL and sets
    // externalId: null (html-fetcher.ts) — it has no per-item identity, it's
    // a snapshot. Skipping it by URL alone (the pre-fix behavior) meant any
    // HTML source could only ever contribute a document on its very first
    // run: every subsequent run refetched the identical URL, always matched
    // the first run's stored row, and got silently dropped — forever — no
    // matter how much the page's actual content changed.
    const kb = await createTestKnowledgeBase();
    const source = await makeSource(kb.id, "https://example.com/news");
    const firstFetch = buildNormalizedDocument({
      url: "https://example.com/news",
      title: "News",
      content: "Monday's headlines",
    });
    await prisma.sourceDocument.create({
      data: {
        sourceId: source.id,
        url: firstFetch.url,
        title: firstFetch.title,
        content: firstFetch.content,
        contentHash: firstFetch.contentHash,
      },
    });

    // Same URL (as it always is for a page snapshot), genuinely new content.
    const secondFetchChanged = buildNormalizedDocument({
      url: "https://example.com/news",
      title: "News",
      content: "Tuesday's headlines — completely different",
    });
    const freshChanged = await filterOutExactDuplicates(source.id, [secondFetchChanged]);
    expect(freshChanged).toHaveLength(1);

    // Store that second snapshot, then refetch with genuinely unchanged content.
    await prisma.sourceDocument.create({
      data: {
        sourceId: source.id,
        url: secondFetchChanged.url,
        title: secondFetchChanged.title,
        content: secondFetchChanged.content,
        contentHash: secondFetchChanged.contentHash,
      },
    });
    const thirdFetchUnchanged = buildNormalizedDocument({
      url: "https://example.com/news",
      title: "News",
      content: "Tuesday's headlines — completely different",
    });
    const freshUnchanged = await filterOutExactDuplicates(source.id, [thirdFetchUnchanged]);
    expect(freshUnchanged).toHaveLength(0); // nothing actually changed — correctly skipped
  });

  it("de-duplicates within a single batch, not just against the database", async () => {
    const kb = await createTestKnowledgeBase();
    const source = await makeSource(kb.id, "https://example.com/feed2.xml");

    const doc = buildNormalizedDocument({ externalId: "a", url: "https://example.com/a", title: "A", content: "same text" });
    const duplicateInBatch = buildNormalizedDocument({ externalId: "a", url: "https://example.com/a", title: "A again", content: "same text" });

    const fresh = await filterOutExactDuplicates(source.id, [doc, duplicateInBatch]);
    expect(fresh).toHaveLength(1);
  });
});
