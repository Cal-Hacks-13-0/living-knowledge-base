import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";

const PAGE_HTML = `<html><head><title>New Hooks API</title></head>
<body><p>The framework shipped a new hooks API with extra lifecycle control.</p></body></html>`;

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("@/lib/research/http", () => ({
  safeFetch: vi.fn().mockResolvedValue({
    status: 200,
    finalUrl: "https://example.com/hooks-api",
    headers: new Headers({ "content-type": "text/html" }),
    text: PAGE_HTML,
    notModified: false,
  }),
  withRetry: (fn: () => Promise<unknown>) => fn(),
  isAllowedByRobots: vi.fn().mockResolvedValue(true),
}));

function toolUseResponse(name: string, input: Record<string, unknown>) {
  return { content: [{ type: "tool_use", id: "t1", name, input }] };
}
function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}
function structuredToolResponse(input: Record<string, unknown>) {
  return { content: [{ type: "tool_use", id: "t2", name: "emit_result", input }] };
}

describe("AI Assistant tool use (global, multi-KB)", () => {
  beforeEach(async () => {
    await resetDb();
    mockCreate.mockReset();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("archives a shared URL into the knowledge base the model picks via fetch_and_archive_url", async () => {
    const { answerAssistantQuestion } = await import("@/lib/ai/assistant-agent");

    const kb = await createTestKnowledgeBase({ userGoal: "Track framework hooks updates" });

    mockCreate
      // 1. Assistant decides to call the tool, naming the KB id from context
      .mockImplementationOnce(() =>
        toolUseResponse("fetch_and_archive_url", { url: "https://example.com/hooks-api", knowledgeBaseId: kb.id })
      )
      // 2. Inside the tool: Extraction Agent call
      .mockImplementationOnce(() =>
        structuredToolResponse({
          summary: "A new hooks API shipped with extra lifecycle control.",
          keyClaims: ["New hooks API adds lifecycle control"],
          topics: ["hooks"],
          entities: [],
          publishedAt: null,
          excerpts: ["new hooks API with extra lifecycle control"],
          isRelevant: true,
        })
      )
      // 3. Inside the tool: Comparison Agent call (no existing entries -> UNRELATED)
      .mockImplementationOnce(() =>
        structuredToolResponse({
          classification: "UNRELATED",
          noveltyScore: 0.8,
          explanation: "No existing entry covers this.",
          relatedEntryId: null,
          proposedChange: null,
        })
      )
      // 4. Assistant's final reply after seeing the tool result
      .mockImplementationOnce(() => textResponse("Done — I archived that page as a new entry."));

    const answer = await answerAssistantQuestion({
      knowledgeBases: [{ id: kb.id, name: kb.name, userGoal: kb.userGoal }],
      currentKnowledgeBaseId: kb.id,
      message: "Please archive https://example.com/hooks-api",
      history: [],
      relevantEntries: [],
      recentInsights: [],
    });

    expect(answer.reply).toContain("archived");
    expect(answer.suggestedKnowledgeBase).toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(4);

    const entries = await prisma.knowledgeEntry.findMany({ where: { knowledgeBaseId: kb.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("New Hooks API");

    const sources = await prisma.source.findMany({ where: { knowledgeBaseId: kb.id } });
    expect(sources).toHaveLength(1);
    expect(sources[0].status).toBe("PAUSED"); // never auto-fetched by the scheduler
  });

  it("does not archive a URL whose page already exists (exact dedup)", async () => {
    const { fetchAndArchiveUrl } = await import("@/lib/ai/assistant-tools");
    const kb = await createTestKnowledgeBase();

    mockCreate
      .mockImplementationOnce(() =>
        structuredToolResponse({
          summary: "s",
          keyClaims: [],
          topics: [],
          entities: [],
          publishedAt: null,
          excerpts: [],
          isRelevant: true,
        })
      )
      .mockImplementationOnce(() =>
        structuredToolResponse({
          classification: "UNRELATED",
          noveltyScore: 0.5,
          explanation: "e",
          relatedEntryId: null,
          proposedChange: null,
        })
      );
    await fetchAndArchiveUrl(kb.id, "https://example.com/hooks-api");

    mockCreate.mockReset();
    const second = await fetchAndArchiveUrl(kb.id, "https://example.com/hooks-api");
    expect(second).toMatch(/already archived/i);
    expect(mockCreate).not.toHaveBeenCalled();

    const docs = await prisma.sourceDocument.findMany({ where: { source: { knowledgeBaseId: kb.id } } });
    expect(docs).toHaveLength(1);
  });

  it("run_research_now refuses to start a second overlapping run", async () => {
    const { runResearchNow } = await import("@/lib/ai/assistant-tools");
    const kb = await createTestKnowledgeBase();
    await prisma.researchRun.create({ data: { knowledgeBaseId: kb.id, status: "RUNNING" } });

    const result = await runResearchNow(kb.id);
    expect(result).toMatch(/already in progress/i);
  });

  it("archive/research tools return a friendly message for an unknown knowledgeBaseId instead of throwing or guessing", async () => {
    const { runResearchNow } = await import("@/lib/ai/assistant-tools");
    const result = await runResearchNow("not-a-real-kb-id");
    expect(result).toMatch(/no knowledge base matches/i);
  });

  it("propose_new_knowledge_base surfaces a suggestedKnowledgeBase instead of creating anything", async () => {
    const { answerAssistantQuestion } = await import("@/lib/ai/assistant-agent");

    mockCreate
      .mockImplementationOnce(() =>
        toolUseResponse("propose_new_knowledge_base", {
          goal: "I want to build a knowledge base about competitive speedrunning.",
        })
      )
      .mockImplementationOnce(() =>
        textResponse("I've put together a starting point for a speedrunning knowledge base — take a look!")
      );

    const answer = await answerAssistantQuestion({
      knowledgeBases: [],
      currentKnowledgeBaseId: null,
      message: "I want to start tracking speedrunning strategies",
      history: [],
      relevantEntries: [],
      recentInsights: [],
    });

    expect(answer.suggestedKnowledgeBase).toEqual({
      goal: "I want to build a knowledge base about competitive speedrunning.",
    });
    expect(answer.reply).toContain("speedrunning");

    // Nothing was actually created.
    const count = await prisma.knowledgeBase.count();
    expect(count).toBe(0);
  });
});
