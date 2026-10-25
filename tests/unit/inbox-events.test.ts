import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";
import { applyComparisonClassification } from "@/lib/knowledge/classification";
import { approveProposal, rejectProposal } from "@/lib/knowledge/versioning";
import { listInboxEvents, recordInboxEvent } from "@/lib/inbox/events";
import type { ComparisonResponse, ExtractionResponse } from "@/lib/ai/schemas";

const generateStructured = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/client")>()),
  generateStructured,
}));
const { getWeeklyOverview, getWeeklyReview } = await import("@/lib/inbox/digest");

const extraction: ExtractionResponse = {
  summary: "React 20 ships a new compiler by default.",
  keyClaims: ["The React compiler is on by default in React 20."],
  topics: [],
  entities: [],
  publishedAt: null,
  excerpts: [],
  isRelevant: true,
  category: null,
};

function comparison(overrides: Partial<ComparisonResponse>): ComparisonResponse {
  return {
    classification: "UNRELATED",
    noveltyScore: 0.8,
    explanation: "Not covered by any existing entry.",
    relatedEntryId: null,
    proposedChange: null,
    ...overrides,
  } as ComparisonResponse;
}

async function seed() {
  const kb = await createTestKnowledgeBase({ name: "Frontend" });
  const source = await prisma.source.create({
    data: { knowledgeBaseId: kb.id, name: "React releases", url: "https://github.com/facebook/react", type: "GITHUB_RELEASES" },
  });
  const doc = await prisma.sourceDocument.create({
    data: { sourceId: source.id, url: "https://github.com/facebook/react/releases/tag/v20.0.0", title: "React 20", content: "…", contentHash: "h1" },
  });
  return { kb, doc };
}

describe("Inbox events from real changes", () => {
  beforeEach(async () => {
    await resetDb();
    generateStructured.mockReset();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("records an applied external discovery with provenance when a draft entry is created", async () => {
    const { kb, doc } = await seed();
    const outcome = await applyComparisonClassification({
      knowledgeBaseId: kb.id,
      title: "React 20 release",
      extraction,
      comparison: comparison({}),
      sourceDocumentId: doc.id,
      origin: "manual_scan",
    });
    expect(outcome.action).toBe("created_entry");
    const [event] = await listInboxEvents();
    expect(event).toMatchObject({
      category: "EXTERNAL_DISCOVERY",
      status: "APPLIED",
      workspaceId: "default",
      knowledgeBaseId: kb.id,
      title: "New note: React 20 release",
      origin: "manual_scan",
      sourceName: "React releases",
      sourceUrl: doc.url,
    });
    expect(event.knowledgeEntryId).toBe(outcome.action === "created_entry" ? outcome.entryId : null);
  });

  it("is idempotent: re-recording the same change doesn't duplicate it", async () => {
    const { kb } = await seed();
    const input = {
      dedupeKey: "entry:abc",
      category: "EXTERNAL_DISCOVERY" as const,
      status: "APPLIED" as const,
      knowledgeBaseId: kb.id,
      title: "t",
      description: "d",
      origin: "scheduled_scan" as const,
    };
    await recordInboxEvent(input);
    await recordInboxEvent({ ...input, title: "retried" });
    const events = await listInboxEvents();
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("t");
  });

  it("an EXTENSION of an existing note is a source refresh", async () => {
    const { kb, doc } = await seed();
    const existing = await prisma.knowledgeEntry.create({
      data: { knowledgeBaseId: kb.id, title: "React compiler", summary: "s", content: "c" },
    });
    await applyComparisonClassification({
      knowledgeBaseId: kb.id,
      title: "React 20 release",
      extraction,
      comparison: comparison({ classification: "EXTENSION", relatedEntryId: existing.id }),
      sourceDocumentId: doc.id,
      origin: "scheduled_scan",
    });
    const [event] = await listInboxEvents();
    expect(event.category).toBe("SOURCE_REFRESH");
    expect(event.title).toContain("React compiler");
  });

  it("a contradiction is a PROPOSED correction until approved, then APPLIED in the same transaction", async () => {
    const { kb, doc } = await seed();
    const target = await prisma.knowledgeEntry.create({
      data: { knowledgeBaseId: kb.id, title: "React compiler", summary: "Opt-in.", content: "The compiler is opt-in.", status: "VERIFIED" },
    });
    const outcome = await applyComparisonClassification({
      knowledgeBaseId: kb.id,
      title: "React 20 release",
      extraction,
      comparison: comparison({
        classification: "CONTRADICTION",
        relatedEntryId: target.id,
        explanation: "The release notes say the compiler is now on by default.",
        proposedChange: {
          operation: "UPDATE",
          proposedTitle: "React compiler",
          proposedSummary: "On by default.",
          proposedContent: "The compiler is on by default since React 20.",
        },
      }),
      sourceDocumentId: doc.id,
      origin: "manual_scan",
    });
    expect(outcome.action).toBe("created_proposal");
    let [event] = await listInboxEvents();
    expect(event).toMatchObject({
      category: "CORRECTION",
      status: "PROPOSED",
      knowledgeEntryId: target.id,
      beforeContent: "The compiler is opt-in.",
      afterContent: "The compiler is on by default since React 20.",
    });
    // Not applied yet: the note is unchanged.
    expect((await prisma.knowledgeEntry.findUniqueOrThrow({ where: { id: target.id } })).content).toBe("The compiler is opt-in.");

    await approveProposal(event.proposalId!);
    [event] = await listInboxEvents();
    expect(event.status).toBe("APPLIED");
    expect(event.resolvedAt).not.toBeNull();
    expect((await prisma.knowledgeEntry.findUniqueOrThrow({ where: { id: target.id } })).content).toBe(
      "The compiler is on by default since React 20."
    );
    // A second approval fails and leaves the event alone.
    await expect(approveProposal(event.proposalId!)).rejects.toThrow();
    expect(await listInboxEvents()).toHaveLength(1);
  });

  it("declining a proposal marks its event DECLINED", async () => {
    const { kb, doc } = await seed();
    await applyComparisonClassification({
      knowledgeBaseId: kb.id,
      title: "React 20 release",
      extraction,
      comparison: comparison({ classification: "REPLACEMENT_CANDIDATE" }),
      sourceDocumentId: doc.id,
      origin: "assistant_archive",
    });
    const [proposed] = await listInboxEvents();
    await rejectProposal(proposed.proposalId!);
    const [event] = await listInboxEvents();
    expect(event.status).toBe("DECLINED");
  });

  it("only lists the current workspace's events", async () => {
    const { kb } = await seed();
    await prisma.inboxEvent.create({
      data: { workspaceId: "someone-else", dedupeKey: "x", category: "EXTERNAL_DISCOVERY", status: "APPLIED", knowledgeBaseId: kb.id, title: "t", description: "d", origin: "manual_scan" },
    });
    expect(await listInboxEvents()).toHaveLength(0);
  });
});

describe("Inbox weekly digests", () => {
  beforeEach(async () => {
    await resetDb();
    generateStructured.mockReset();
  });

  it("doesn't call the AI when nothing happened this week", async () => {
    await seed();
    expect((await getWeeklyOverview()).status).toBe("empty");
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("caches the overview until this week's events change", async () => {
    const { kb, doc } = await seed();
    await applyComparisonClassification({ knowledgeBaseId: kb.id, title: "A", extraction, comparison: comparison({}), sourceDocumentId: doc.id, origin: "manual_scan" });
    generateStructured.mockResolvedValue({ overview: "You added a note on React 20." });

    const first = await getWeeklyOverview();
    const second = await getWeeklyOverview();
    expect(first).toMatchObject({ status: "ready", cached: false, stats: { updates: 1, vaults: 1 } });
    expect(second).toMatchObject({ status: "ready", cached: true });
    expect(generateStructured).toHaveBeenCalledTimes(1);
    // The prompt is built from the recorded event, not invented data.
    expect(generateStructured.mock.calls[0][0].prompt).toContain("New note: A");

    await recordInboxEvent({ dedupeKey: "entry:new", category: "EXTERNAL_DISCOVERY", status: "APPLIED", knowledgeBaseId: kb.id, title: "B", description: "d", origin: "manual_scan" });
    expect(await getWeeklyOverview()).toMatchObject({ status: "ready", cached: false });
    expect(generateStructured).toHaveBeenCalledTimes(2);
  });

  it("review keeps only references to real events in the range", async () => {
    const { kb, doc } = await seed();
    await applyComparisonClassification({ knowledgeBaseId: kb.id, title: "A", extraction, comparison: comparison({}), sourceDocumentId: doc.id, origin: "manual_scan" });
    const [event] = await listInboxEvents();
    generateStructured.mockResolvedValue({ sections: [{ heading: "React", body: "A new release.", eventIds: [event.id, "made-up-id"] }] });
    const review = await getWeeklyReview();
    expect(review.status === "ready" && review.digest.sections[0].eventIds).toEqual([event.id]);
  });
});
