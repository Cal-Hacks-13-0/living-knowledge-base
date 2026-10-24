import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";
import { filterOutExactDuplicates } from "@/lib/research/deduplicator";
import { buildNormalizedDocument } from "@/lib/research/normalizer";

describe("filterOutExactDuplicates", () => {
  beforeEach(resetDb);
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("keeps new documents and drops ones already stored by URL or content hash", async () => {
    const kb = await createTestKnowledgeBase();
    const source = await prisma.source.create({
      data: { knowledgeBaseId: kb.id, name: "Feed", url: "https://example.com/feed.xml", type: "RSS" },
    });

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

    const sameUrlDifferentCase = buildNormalizedDocument({
      url: "https://example.com/posts/1",
      title: "Post 1 (reposted)",
      content: "Totally different content this time",
    });
    const sameContentDifferentUrl = buildNormalizedDocument({
      url: "https://example.com/posts/1-mirror",
      title: "Post 1 mirror",
      content: "Original content",
    });
    const genuinelyNew = buildNormalizedDocument({
      url: "https://example.com/posts/2",
      title: "Post 2",
      content: "Brand new content",
    });

    const fresh = await filterOutExactDuplicates(source.id, [
      sameUrlDifferentCase,
      sameContentDifferentUrl,
      genuinelyNew,
    ]);

    expect(fresh).toHaveLength(1);
    expect(fresh[0].url).toBe(genuinelyNew.url);
  });

  it("de-duplicates within a single batch, not just against the database", async () => {
    const kb = await createTestKnowledgeBase();
    const source = await prisma.source.create({
      data: { knowledgeBaseId: kb.id, name: "Feed", url: "https://example.com/feed2.xml", type: "RSS" },
    });

    const doc = buildNormalizedDocument({ url: "https://example.com/a", title: "A", content: "same text" });
    const duplicateInBatch = buildNormalizedDocument({ url: "https://example.com/a", title: "A again", content: "same text" });

    const fresh = await filterOutExactDuplicates(source.id, [doc, duplicateInBatch]);
    expect(fresh).toHaveLength(1);
  });
});
