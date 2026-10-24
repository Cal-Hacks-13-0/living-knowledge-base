import { prisma } from "@/lib/db/prisma";

/** Wipes all rows between tests. Order matters for FK constraints. */
export async function resetDb() {
  await prisma.insightEvidence.deleteMany();
  await prisma.knowledgeChangeProposal.deleteMany();
  await prisma.insight.deleteMany();
  await prisma.researchRun.deleteMany();
  await prisma.knowledgeEntry.deleteMany();
  await prisma.sourceDocument.deleteMany();
  await prisma.source.deleteMany();
  await prisma.knowledgeCategory.deleteMany();
  await prisma.knowledgeBase.deleteMany();
}

export async function createTestKnowledgeBase(overrides: Partial<{ name: string; userGoal: string }> = {}) {
  return prisma.knowledgeBase.create({
    data: {
      name: overrides.name ?? "Test KB",
      description: "A test knowledge base",
      userGoal: overrides.userGoal ?? "Track something for testing",
      preferencesJson: "{}",
      monitoringFrequency: "MANUAL",
    },
  });
}
