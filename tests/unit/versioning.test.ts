import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";
import { createChangeProposal, approveProposal, rejectProposal } from "@/lib/knowledge/versioning";

describe("Knowledge change proposal approval/rejection", () => {
  beforeEach(resetDb);
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function setup() {
    const kb = await createTestKnowledgeBase();
    const entry = await prisma.knowledgeEntry.create({
      data: {
        knowledgeBaseId: kb.id,
        title: "Old claim",
        summary: "The old summary.",
        content: "The old content.",
        status: "VERIFIED",
      },
    });
    return { kb, entry };
  }

  it("approving an UPDATE proposal transactionally applies the proposed content", async () => {
    const { kb, entry } = await setup();
    const proposal = await createChangeProposal({
      knowledgeBaseId: kb.id,
      insightId: null,
      targetEntryId: entry.id,
      operation: "UPDATE",
      proposed: { title: "New claim", summary: "The new summary.", content: "The new content." },
      explanation: "Newer source supersedes this.",
    });

    // Previous version must be captured for rollback before applying.
    const stored = JSON.parse(proposal.proposedContent);
    expect(stored.previous.summary).toBe("The old summary.");

    const approved = await approveProposal(proposal.id);
    expect(approved.status).toBe("APPROVED");
    expect(approved.reviewedAt).not.toBeNull();

    const updatedEntry = await prisma.knowledgeEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updatedEntry.summary).toBe("The new summary.");
    expect(updatedEntry.status).toBe("VERIFIED");
  });

  it("rejecting a proposal leaves the existing entry untouched", async () => {
    const { kb, entry } = await setup();
    const proposal = await createChangeProposal({
      knowledgeBaseId: kb.id,
      insightId: null,
      targetEntryId: entry.id,
      operation: "MARK_OBSOLETE",
      proposed: { title: entry.title, summary: entry.summary, content: entry.content },
      explanation: "Possibly outdated.",
    });

    const rejected = await rejectProposal(proposal.id);
    expect(rejected.status).toBe("REJECTED");

    const untouchedEntry = await prisma.knowledgeEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(untouchedEntry.status).toBe("VERIFIED");
    expect(untouchedEntry.summary).toBe("The old summary.");
  });

  it("MARK_OBSOLETE approval marks the entry OUTDATED without deleting it", async () => {
    const { kb, entry } = await setup();
    const proposal = await createChangeProposal({
      knowledgeBaseId: kb.id,
      insightId: null,
      targetEntryId: entry.id,
      operation: "MARK_OBSOLETE",
      proposed: { title: entry.title, summary: entry.summary, content: entry.content },
      explanation: "A newer source replaces this.",
    });

    await approveProposal(proposal.id);
    const updatedEntry = await prisma.knowledgeEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updatedEntry.status).toBe("OUTDATED");
  });

  it("refuses to re-review an already-reviewed proposal", async () => {
    const { kb, entry } = await setup();
    const proposal = await createChangeProposal({
      knowledgeBaseId: kb.id,
      insightId: null,
      targetEntryId: entry.id,
      operation: "UPDATE",
      proposed: { title: "x", summary: "y", content: "z" },
      explanation: "e",
    });
    await approveProposal(proposal.id);
    await expect(approveProposal(proposal.id)).rejects.toThrow(/already reviewed/i);
  });
});
