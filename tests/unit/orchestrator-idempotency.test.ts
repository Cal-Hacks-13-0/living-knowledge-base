import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";
import { runResearch, OverlappingRunError } from "@/lib/research/orchestrator";

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
