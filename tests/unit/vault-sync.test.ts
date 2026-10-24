import { describe, it, expect, beforeEach, afterAll, beforeAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";

let tmpVaultDir: string;

beforeAll(async () => {
  tmpVaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "lkb-vault-test-"));
  process.env.VAULT_DIR = tmpVaultDir;
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
  await fs.rm(tmpVaultDir, { recursive: true, force: true });
  delete process.env.VAULT_DIR;
});

describe("syncKnowledgeBaseToVault", () => {
  beforeEach(resetDb);

  it("writes an Obsidian-readable Markdown folder tree mirroring the database", async () => {
    const { syncKnowledgeBaseToVault } = await import("@/lib/vault/sync");

    const kb = await createTestKnowledgeBase({ name: "Freediving Notes", userGoal: "Track freediving safety" });
    const category = await prisma.knowledgeCategory.create({
      data: { knowledgeBaseId: kb.id, name: "Safety Protocols", description: "" },
    });
    const source = await prisma.source.create({
      data: { knowledgeBaseId: kb.id, name: "Test Feed", url: "https://example.com/feed.xml", type: "RSS" },
    });
    const doc = await prisma.sourceDocument.create({
      data: {
        sourceId: source.id,
        url: "https://example.com/posts/1",
        title: "Blackout prevention basics",
        content: "Never dive alone.",
        contentHash: "hash1",
      },
    });
    const entry = await prisma.knowledgeEntry.create({
      data: {
        knowledgeBaseId: kb.id,
        categoryId: category.id,
        title: "Always use a buddy",
        summary: "Never freedive without a trained buddy watching you.",
        content: "Detailed safety rationale here.",
        sourceDocumentId: doc.id,
        status: "DRAFT",
      },
    });
    const insight = await prisma.insight.create({
      data: {
        knowledgeBaseId: kb.id,
        title: "New safety guidance found",
        type: "NEW_DISCOVERY",
        summary: "A source emphasizes buddy diving.",
        whyItMatters: "Directly relevant to your safety goal.",
        recommendedAction: "Review and save.",
        confidence: 0.8,
        status: "PENDING",
      },
    });
    await prisma.insightEvidence.create({
      data: { insightId: insight.id, sourceDocumentId: doc.id, knowledgeEntryId: entry.id, explanation: "Supports the claim." },
    });

    const kbDir = await syncKnowledgeBaseToVault(kb.id);

    // _Overview.md exists and is tagged with the KB id for rename-detection.
    const overview = await fs.readFile(path.join(kbDir, "_Overview.md"), "utf-8");
    expect(overview).toContain(`id: "${kb.id}"`);
    expect(overview).toContain("Freediving Notes");
    expect(overview).toContain("[[Safety Protocols]]");

    // Entry file exists under its category folder.
    const entryFiles = await fs.readdir(path.join(kbDir, "02_Knowledge", "safety-protocols"));
    expect(entryFiles.length).toBe(1);
    const entryContent = await fs.readFile(path.join(kbDir, "02_Knowledge", "safety-protocols", entryFiles[0]), "utf-8");
    expect(entryContent).toContain("Always use a buddy");
    expect(entryContent).toContain("Never freedive without a trained buddy watching you.");

    // Insight file exists with evidence linked.
    const insightFiles = await fs.readdir(path.join(kbDir, "03_Insights"));
    expect(insightFiles.length).toBe(1);
    const insightContent = await fs.readFile(path.join(kbDir, "03_Insights", insightFiles[0]), "utf-8");
    expect(insightContent).toContain("New safety guidance found");
    expect(insightContent).toContain("Blackout prevention basics");

    // Source file exists with its fetched document listed.
    const sourceFiles = await fs.readdir(path.join(kbDir, "01_Sources"));
    expect(sourceFiles.length).toBe(1);
    const sourceContent = await fs.readFile(path.join(kbDir, "01_Sources", sourceFiles[0]), "utf-8");
    expect(sourceContent).toContain("Blackout prevention basics");
  });

  it("renames the KB folder (without duplicating it) when the name changes", async () => {
    const { syncKnowledgeBaseToVault } = await import("@/lib/vault/sync");

    const kb = await createTestKnowledgeBase({ name: "Original Name" });
    const firstDir = await syncKnowledgeBaseToVault(kb.id);
    expect(path.basename(firstDir)).toMatch(/^original-name-/);

    await prisma.knowledgeBase.update({ where: { id: kb.id }, data: { name: "Renamed Knowledge Base" } });
    const secondDir = await syncKnowledgeBaseToVault(kb.id);
    expect(path.basename(secondDir)).toMatch(/^renamed-knowledge-base-/);

    const oldDirExists = await fs
      .access(firstDir)
      .then(() => true)
      .catch(() => false);
    expect(oldDirExists).toBe(false); // old folder was renamed, not duplicated

    const vaultEntries = await fs.readdir(path.dirname(secondDir));
    const matchingDirs = vaultEntries.filter((e) => e.includes(kb.id.slice(-8)));
    expect(matchingDirs).toHaveLength(1);
  });

  it("is idempotent and prunes stale files (e.g. after a category rename)", async () => {
    const { syncKnowledgeBaseToVault } = await import("@/lib/vault/sync");

    const kb = await createTestKnowledgeBase();
    const category = await prisma.knowledgeCategory.create({
      data: { knowledgeBaseId: kb.id, name: "Old Category", description: "" },
    });
    await prisma.knowledgeEntry.create({
      data: {
        knowledgeBaseId: kb.id,
        categoryId: category.id,
        title: "Some entry",
        summary: "s",
        content: "c",
        status: "DRAFT",
      },
    });

    const kbDir = await syncKnowledgeBaseToVault(kb.id);
    const beforeDirs = await fs.readdir(path.join(kbDir, "02_Knowledge"));
    expect(beforeDirs).toContain("old-category");

    await prisma.knowledgeCategory.update({ where: { id: category.id }, data: { name: "New Category" } });
    await syncKnowledgeBaseToVault(kb.id);

    const afterDirs = await fs.readdir(path.join(kbDir, "02_Knowledge"));
    expect(afterDirs).toContain("new-category");
    expect(afterDirs).not.toContain("old-category");
  });
});
