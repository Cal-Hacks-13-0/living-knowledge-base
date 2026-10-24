import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";

// --- Deterministic fixtures: no live network, no live Claude calls. ---------

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Fixture Feed</title>
  <item>
    <title>New hooks API shipped</title>
    <link>https://example.com/posts/hooks-api</link>
    <guid>https://example.com/posts/hooks-api</guid>
    <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    <description>The framework shipped a new hooks API with extra lifecycle control.</description>
  </item>
  <item>
    <title>Old caching guidance is now wrong</title>
    <link>https://example.com/posts/caching-update</link>
    <guid>https://example.com/posts/caching-update</guid>
    <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
    <description>The official docs now recommend the opposite caching strategy for this framework.</description>
  </item>
</channel></rss>`;

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("@/lib/research/http", () => ({
  safeFetch: vi.fn().mockResolvedValue({
    status: 200,
    finalUrl: "https://example.com/feed.xml",
    headers: new Headers({ etag: '"v1"' }),
    text: RSS_FIXTURE,
    notModified: false,
  }),
  withRetry: (fn: () => Promise<unknown>) => fn(),
  isAllowedByRobots: vi.fn().mockResolvedValue(true),
}));

function toolResponse(input: Record<string, unknown>) {
  return { content: [{ type: "tool_use", id: "t", name: "emit_result", input }] };
}

describe("end-to-end: create KB -> add RSS source -> run research -> insight -> proposal review", () => {
  beforeEach(async () => {
    await resetDb();
    mockCreate.mockReset();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("stores documents without duplicating on repeated runs, generates an evidence-backed insight, and lets the user approve a proposed update", async () => {
    const { runResearch } = await import("@/lib/research/orchestrator");
    const { approveProposal } = await import("@/lib/knowledge/versioning");

    // 1. Create knowledge base with one RSS source (mirrors POST /api/knowledge-bases + POST .../sources).
    const kb = await createTestKnowledgeBase({ userGoal: "Track framework caching and hooks guidance" });
    await prisma.source.create({
      data: { knowledgeBaseId: kb.id, name: "Fixture Feed", url: "https://example.com/feed.xml", type: "RSS" },
    });

    // Pre-existing knowledge entry that the second fixture item will contradict.
    const existingEntry = await prisma.knowledgeEntry.create({
      data: {
        knowledgeBaseId: kb.id,
        title: "Caching strategy",
        summary: "Docs recommend aggressive caching for this framework.",
        content: "Docs recommend aggressive caching for this framework.",
        status: "VERIFIED",
      },
    });

    // 2. Queue deterministic Claude responses in the exact order the orchestrator calls them:
    //    extract(doc1) -> compare(doc1) -> extract(doc2) -> compare(doc2) -> insights(batch)
    mockCreate
      .mockImplementationOnce(() =>
        toolResponse({
          summary: "A new hooks API shipped with extra lifecycle control.",
          keyClaims: ["New hooks API adds lifecycle control"],
          topics: ["hooks"],
          entities: [],
          publishedAt: null,
          excerpts: ["new hooks API with extra lifecycle control"],
          isRelevant: true,
        })
      )
      .mockImplementationOnce(() =>
        toolResponse({
          classification: "EXTENSION",
          noveltyScore: 0.6,
          explanation: "Adds new detail not previously tracked.",
          relatedEntryId: null,
          proposedChange: null,
        })
      )
      .mockImplementationOnce(() =>
        toolResponse({
          summary: "Official guidance now recommends the opposite caching strategy.",
          keyClaims: ["Caching guidance reversed"],
          topics: ["caching", "strategy"],
          entities: [],
          publishedAt: null,
          excerpts: ["now recommends the opposite caching strategy"],
          isRelevant: true,
        })
      )
      .mockImplementationOnce(() =>
        toolResponse({
          classification: "CONTRADICTION",
          noveltyScore: 0.8,
          explanation: "New source directly conflicts with the stored caching entry.",
          relatedEntryId: existingEntry.id,
          proposedChange: {
            operation: "UPDATE",
            proposedTitle: "Caching strategy (updated)",
            proposedSummary: "Docs now recommend the opposite caching strategy.",
            proposedContent: "Docs now recommend the opposite caching strategy for this framework.",
          },
        })
      )
      .mockImplementationOnce(() =>
        toolResponse({
          insights: [
            {
              title: "Caching guidance reversed",
              type: "CONTRADICTION",
              summary: "The framework's official docs now recommend the opposite caching strategy.",
              whyItMatters: "Your stored knowledge about caching is now contradicted by an official source.",
              recommendedAction: "Review the proposed update to your caching entry.",
              confidence: 0.75,
              evidenceDocumentIndexes: [1],
              relatedEntryId: existingEntry.id,
            },
          ],
        })
      );

    // 3. Run research (mirrors POST /api/knowledge-bases/:id/research).
    const run = await runResearch(kb.id);

    expect(run.status).toBe("COMPLETED");
    expect(run.documentsFetched).toBe(2);
    expect(run.documentsProcessed).toBe(2);
    expect(run.insightsGenerated).toBe(1);

    const storedDocs = await prisma.sourceDocument.findMany({ where: { source: { knowledgeBaseId: kb.id } } });
    expect(storedDocs).toHaveLength(2);

    const newDraftEntries = await prisma.knowledgeEntry.findMany({
      where: { knowledgeBaseId: kb.id, id: { not: existingEntry.id } },
    });
    expect(newDraftEntries).toHaveLength(1);
    expect(newDraftEntries[0].status).toBe("DRAFT");

    const insights = await prisma.insight.findMany({
      where: { knowledgeBaseId: kb.id },
      include: { evidence: true },
    });
    expect(insights).toHaveLength(1);
    expect(insights[0].type).toBe("CONTRADICTION");
    expect(insights[0].evidence.length).toBeGreaterThan(0);

    const proposals = await prisma.knowledgeChangeProposal.findMany({ where: { knowledgeBaseId: kb.id } });
    expect(proposals).toHaveLength(1);
    expect(proposals[0].status).toBe("PENDING");
    expect(proposals[0].targetEntryId).toBe(existingEntry.id);

    // 4. User reviews and approves the proposed update.
    await approveProposal(proposals[0].id);
    const updatedEntry = await prisma.knowledgeEntry.findUniqueOrThrow({ where: { id: existingEntry.id } });
    expect(updatedEntry.summary).toBe("Docs now recommend the opposite caching strategy.");

    // 5. Re-running research against the same (unchanged) feed must not duplicate documents.
    mockCreate.mockReset(); // no new findings expected — nothing new in the feed
    const secondRun = await runResearch(kb.id);
    expect(secondRun.documentsFetched).toBe(2); // still parsed from the feed
    expect(secondRun.documentsProcessed).toBe(0); // but none were new -> nothing to process
    const docsAfterSecondRun = await prisma.sourceDocument.findMany({
      where: { source: { knowledgeBaseId: kb.id } },
    });
    expect(docsAfterSecondRun).toHaveLength(2); // still exactly 2 — exact dedup worked
  });
});
