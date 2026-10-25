import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";
import { runResearch, OverlappingRunError } from "@/lib/research/orchestrator";

const fetchRssSource = vi.hoisted(() => vi.fn());
vi.mock("@/lib/research/rss-fetcher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/research/rss-fetcher")>()),
  fetchRssSource,
}));

const fetchHtmlSource = vi.hoisted(() => vi.fn());
vi.mock("@/lib/research/html-fetcher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/research/html-fetcher")>()),
  fetchHtmlSource,
}));

const generateStructured = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/client")>()),
  generateStructured,
}));

describe("research-run overlap prevention (idempotency)", () => {
  beforeEach(resetDb);
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("refuses to start a second run while one is already RUNNING for the same knowledge base", async () => {
    const kb = await createTestKnowledgeBase();
    await prisma.researchRun.create({ data: { knowledgeBaseId: kb.id, status: "RUNNING" } });

    await expect(runResearch(kb.id)).rejects.toBeInstanceOf(OverlappingRunError);

    // Exactly one run should exist — the orchestrator must not have created another.
    const runs = await prisma.researchRun.findMany({ where: { knowledgeBaseId: kb.id } });
    expect(runs).toHaveLength(1);
  });

  it("allows a new run once the previous one has completed", async () => {
    const kb = await createTestKnowledgeBase();
    await prisma.researchRun.create({
      data: { knowledgeBaseId: kb.id, status: "COMPLETED", completedAt: new Date() },
    });

    // No sources configured, so this completes immediately without any fetch/AI calls.
    const run = await runResearch(kb.id);
    expect(run.status).toBe("COMPLETED");
    expect(run.documentsFetched).toBe(0);
  });
});

function mockAi() {
  generateStructured.mockImplementation(async (args: { prompt: string }) => {
    if (args.prompt.includes("Call the emit_result tool with your classification")) {
      return { classification: "UNRELATED", noveltyScore: 0.9, explanation: "New information.", relatedEntryId: null, proposedChange: null };
    }
    if (args.prompt.includes("Call the emit_result tool with 1 to 3 high-value insights")) {
      return {
        insights: [
          {
            title: "Relevant update",
            type: "NEW_DISCOVERY",
            summary: "A relevant update was found.",
            whyItMatters: "It adds new information to the vault.",
            recommendedAction: "Review the new knowledge entry.",
            confidence: 0.8,
            evidenceDocumentIndexes: [0],
            relatedEntryId: null,
          },
        ],
      };
    }
    return {
      summary: "A relevant update.",
      keyClaims: ["Something changed."],
      topics: [],
      entities: [],
      publishedAt: null,
      excerpts: [],
      isRelevant: true,
    };
  });
}

describe("HTML source re-runs: content changes are processed, repeats are not (regression for the 'fetched N, processed 0' bug)", () => {
  beforeEach(async () => {
    await resetDb();
    fetchRssSource.mockReset();
    fetchHtmlSource.mockReset();
    generateStructured.mockReset();
    mockAi();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  // fetchHtmlSource always refetches the SAME configured page URL — that's
  // the actual shape of the bug: a page snapshot, not a per-item feed.
  function htmlResult(content: string) {
    return {
      documents: [
        { externalId: null, url: "https://example.com/news", title: "News", content, contentHash: `hash:${content}`, publishedAt: null },
      ],
      notModified: false,
      etag: null,
      lastModified: null,
    };
  }

  it("processes a re-fetched HTML page when its content genuinely changed, instead of silently dropping it as a duplicate URL", async () => {
    const kb = await createTestKnowledgeBase();
    await prisma.source.create({ data: { knowledgeBaseId: kb.id, name: "News", url: "https://example.com/news", type: "HTML" } });

    fetchHtmlSource.mockResolvedValueOnce(htmlResult("Monday's headlines"));
    const first = await runResearch(kb.id);
    expect(first.status).toBe("COMPLETED");
    expect(first.documentsFetched).toBe(1);
    expect(first.documentsProcessed).toBe(1); // this is the bug: pre-fix, every run after this one would show 0

    fetchHtmlSource.mockResolvedValueOnce(htmlResult("Tuesday's headlines — totally different"));
    const second = await runResearch(kb.id);
    expect(second.documentsFetched).toBe(1);
    expect(second.documentsProcessed).toBe(1); // real new content — must be processed, not dropped
  });

  it("honestly reports nothing new when a re-fetched HTML page's content is unchanged — a legitimate outcome, not a failure", async () => {
    const kb = await createTestKnowledgeBase();
    await prisma.source.create({ data: { knowledgeBaseId: kb.id, name: "News", url: "https://example.com/news", type: "HTML" } });

    fetchHtmlSource.mockResolvedValueOnce(htmlResult("Monday's headlines"));
    await runResearch(kb.id);

    fetchHtmlSource.mockResolvedValueOnce(htmlResult("Monday's headlines")); // byte-identical
    const second = await runResearch(kb.id);
    expect(second.status).toBe("COMPLETED");
    expect(second.documentsFetched).toBe(1); // still fetched over the wire
    expect(second.documentsProcessed).toBe(0); // correctly nothing new — no AI call wasted on it
    expect(second.errorMessage).toBeNull(); // and NOT labeled as any kind of failure
  });

  it("generates an insight from successful new content even when another source makes the run partial", async () => {
    const kb = await createTestKnowledgeBase();
    await prisma.source.createMany({
      data: [
        { knowledgeBaseId: kb.id, name: "Working news", url: "https://example.com/news", type: "HTML" },
        { knowledgeBaseId: kb.id, name: "Broken feed", url: "https://example.com/feed", type: "RSS" },
      ],
    });

    fetchHtmlSource.mockResolvedValueOnce(htmlResult("A genuinely new tournament result"));
    fetchRssSource.mockRejectedValueOnce(new Error("upstream unavailable"));

    const run = await runResearch(kb.id);

    expect(run.status).toBe("PARTIAL");
    expect(run.documentsProcessed).toBe(1);
    expect(run.insightsGenerated).toBe(1);
    expect(run.errorMessage).toContain("Broken feed: upstream unavailable");
  });
});

describe("RSS source feed self-healing", () => {
  beforeEach(async () => {
    await resetDb();
    fetchRssSource.mockReset();
    fetchHtmlSource.mockReset();
    generateStructured.mockReset();
    // Not relevant to this knowledge base's goal — short-circuits before any
    // further AI calls, keeping these tests focused on the fetch/persist path.
    generateStructured.mockResolvedValue({
      summary: "",
      keyClaims: [],
      topics: [],
      entities: [],
      publishedAt: null,
      excerpts: [],
      isRelevant: false,
    });
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("persists a source's auto-discovered feed URL so future runs skip the page entirely", async () => {
    const kb = await createTestKnowledgeBase();
    const source = await prisma.source.create({
      data: { knowledgeBaseId: kb.id, name: "Blog", url: "https://example.com/blog/", type: "RSS" },
    });
    fetchRssSource.mockResolvedValue({
      documents: [
        { externalId: "1", url: "https://example.com/p/1", title: "Post", content: "c", contentHash: "h1", publishedAt: null },
      ],
      notModified: false,
      etag: null,
      lastModified: null,
      discoveredUrl: "https://example.com/rss/blog/",
    });

    await runResearch(kb.id);

    const updated = await prisma.source.findUnique({ where: { id: source.id } });
    expect(updated?.url).toBe("https://example.com/rss/blog/");
    expect(updated?.status).toBe("ACTIVE");
  });

  it("leaves the source URL untouched when nothing was discovered", async () => {
    const kb = await createTestKnowledgeBase();
    const source = await prisma.source.create({
      data: { knowledgeBaseId: kb.id, name: "Feed", url: "https://example.com/feed.xml", type: "RSS" },
    });
    fetchRssSource.mockResolvedValue({
      documents: [],
      notModified: false,
      etag: null,
      lastModified: null,
      discoveredUrl: null,
    });

    await runResearch(kb.id);

    const updated = await prisma.source.findUnique({ where: { id: source.id } });
    expect(updated?.url).toBe("https://example.com/feed.xml");
  });
});
