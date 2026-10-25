import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";
import { DELETE } from "@/app/api/knowledge-bases/[id]/route";
import { recordInboxEvent } from "@/lib/inbox/events";

const call = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/knowledge-bases/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

describe("DELETE /api/knowledge-bases/:id", () => {
  beforeEach(resetDb);
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("deletes the vault and everything that belongs to it, leaving other vaults alone", async () => {
    const kb = await createTestKnowledgeBase({ name: "To delete" });
    const keep = await createTestKnowledgeBase({ name: "Keep me" });
    const parent = await prisma.knowledgeCategory.create({ data: { knowledgeBaseId: kb.id, name: "Parent" } });
    await prisma.knowledgeCategory.create({ data: { knowledgeBaseId: kb.id, name: "Child", parentId: parent.id } });
    const source = await prisma.source.create({
      data: { knowledgeBaseId: kb.id, name: "Feed", url: "https://example.com/feed", type: "RSS" },
    });
    const doc = await prisma.sourceDocument.create({
      data: { sourceId: source.id, url: "https://example.com/a", title: "A", content: "c", contentHash: "h" },
    });
    const entry = await prisma.knowledgeEntry.create({
      data: { knowledgeBaseId: kb.id, title: "Note", summary: "s", content: "c", sourceDocumentId: doc.id },
    });
    const insight = await prisma.insight.create({
      data: { knowledgeBaseId: kb.id, title: "I", type: "NEW_DISCOVERY", summary: "s", whyItMatters: "w", recommendedAction: "r", confidence: 0.5 },
    });
    await prisma.insightEvidence.create({ data: { insightId: insight.id, sourceDocumentId: doc.id, explanation: "e" } });
    await prisma.knowledgeChangeProposal.create({
      data: { knowledgeBaseId: kb.id, targetEntryId: entry.id, operation: "UPDATE", proposedContent: "{}" },
    });
    await prisma.researchRun.create({ data: { knowledgeBaseId: kb.id, status: "COMPLETED" } });
    await recordInboxEvent({ dedupeKey: `entry:${entry.id}`, category: "EXTERNAL_DISCOVERY", status: "APPLIED", knowledgeBaseId: kb.id, title: "t", description: "d", origin: "manual_scan" });
    await prisma.knowledgeEntry.create({ data: { knowledgeBaseId: keep.id, title: "Other", summary: "s", content: "c" } });

    const res = await call(kb.id);
    expect(res.status).toBe(200);

    expect(await prisma.knowledgeBase.findUnique({ where: { id: kb.id } })).toBeNull();
    for (const count of [
      prisma.knowledgeCategory.count({ where: { knowledgeBaseId: kb.id } }),
      prisma.source.count({ where: { knowledgeBaseId: kb.id } }),
      prisma.sourceDocument.count({ where: { sourceId: source.id } }),
      prisma.knowledgeEntry.count({ where: { knowledgeBaseId: kb.id } }),
      prisma.insight.count({ where: { knowledgeBaseId: kb.id } }),
      prisma.insightEvidence.count({ where: { insightId: insight.id } }),
      prisma.knowledgeChangeProposal.count({ where: { knowledgeBaseId: kb.id } }),
      prisma.researchRun.count({ where: { knowledgeBaseId: kb.id } }),
      prisma.inboxEvent.count({ where: { knowledgeBaseId: kb.id } }),
    ]) {
      expect(await count).toBe(0);
    }
    expect(await prisma.knowledgeBase.findUnique({ where: { id: keep.id } })).not.toBeNull();
    expect(await prisma.knowledgeEntry.count({ where: { knowledgeBaseId: keep.id } })).toBe(1);
  });

  it("returns 404 for a vault that doesn't exist", async () => {
    expect((await call("nope")).status).toBe(404);
  });
});
