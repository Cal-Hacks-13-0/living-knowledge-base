import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";
import { assignEntriesToCategory, listEntriesPage, listVaultCategories } from "@/lib/knowledge/categorize";
import { resolveEntryCategory } from "@/lib/knowledge/repository";
import { NotFoundError } from "@/lib/api/response";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

async function seedVault(name: string, entryCount: number) {
  const kb = await createTestKnowledgeBase({ name });
  const technique = await prisma.knowledgeCategory.create({ data: { knowledgeBaseId: kb.id, name: "Technique" } });
  const community = await prisma.knowledgeCategory.create({ data: { knowledgeBaseId: kb.id, name: "Community" } });
  const source = await prisma.source.create({ data: { knowledgeBaseId: kb.id, name: "Feed", url: `https://${kb.id}.example/feed`, type: "RSS" } });
  const entries = [];
  for (let i = 0; i < entryCount; i++) {
    const doc = await prisma.sourceDocument.create({
      data: { sourceId: source.id, url: `https://${kb.id}.example/${i}`, title: `Doc ${i}`, content: `Body ${i}`, contentHash: `${kb.id}-${i}` },
    });
    entries.push(
      await prisma.knowledgeEntry.create({
        data: {
          knowledgeBaseId: kb.id,
          title: `${name} entry ${i}`,
          summary: `Summary ${i}`,
          content: `Content ${i}`,
          status: "DRAFT",
          sourceDocumentId: doc.id,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
        },
      })
    );
  }
  return { kb, technique, community, entries };
}

describe("category assignment", () => {
  beforeEach(async () => {
    await resetDb();
    mockCreate.mockReset();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("categorizes drafts without touching status, content, sources or ids, and counts them", async () => {
    const { kb, technique, entries } = await seedVault("Climb", 3);
    const result = await assignEntriesToCategory({ knowledgeBaseId: kb.id, entryIds: [entries[0].id, entries[1].id], categoryId: technique.id });
    expect(result.updated.map((e) => e.id).sort()).toEqual([entries[0].id, entries[1].id].sort());

    const after = await prisma.knowledgeEntry.findMany({ where: { knowledgeBaseId: kb.id }, orderBy: { createdAt: "asc" } });
    expect(after.map((e) => e.id)).toEqual(entries.map((e) => e.id));
    for (const [i, e] of after.entries()) {
      expect(e.status).toBe("DRAFT");
      expect(e.content).toBe(entries[i].content);
      expect(e.summary).toBe(entries[i].summary);
      expect(e.sourceDocumentId).toBe(entries[i].sourceDocumentId);
    }
    expect(after.map((e) => e.categoryId)).toEqual([technique.id, technique.id, null]);

    const { categories, uncategorized } = await listVaultCategories(kb.id);
    expect(categories.find((c) => c.id === technique.id)?.entryCount).toBe(2);
    expect(uncategorized).toBe(1);
  });

  it("is idempotent: repeating an assignment changes nothing and creates nothing", async () => {
    const { kb, technique, entries } = await seedVault("Climb", 2);
    await assignEntriesToCategory({ knowledgeBaseId: kb.id, entryIds: [entries[0].id], categoryId: technique.id });
    const again = await assignEntriesToCategory({ knowledgeBaseId: kb.id, entryIds: [entries[0].id, entries[0].id], categoryId: technique.id });
    expect(again.updated).toEqual([]);
    expect(again.unchanged.map((e) => e.id)).toEqual([entries[0].id]);
    expect(await prisma.knowledgeEntry.count()).toBe(2);
    expect(await prisma.knowledgeCategory.count({ where: { knowledgeBaseId: kb.id } })).toBe(2);
  });

  it("moves entries back to Uncategorized with null", async () => {
    const { kb, technique, entries } = await seedVault("Climb", 1);
    await assignEntriesToCategory({ knowledgeBaseId: kb.id, entryIds: [entries[0].id], categoryId: technique.id });
    await assignEntriesToCategory({ knowledgeBaseId: kb.id, entryIds: [entries[0].id], categoryId: null });
    expect((await prisma.knowledgeEntry.findUnique({ where: { id: entries[0].id } }))?.categoryId).toBeNull();
  });

  it("rejects cross-vault entries and categories without changing anything", async () => {
    const a = await seedVault("A", 1);
    const b = await seedVault("B", 1);

    // B's entry through A's vault: reported, untouched; A's own entry still moves (partial result).
    const mixed = await assignEntriesToCategory({ knowledgeBaseId: a.kb.id, entryIds: [a.entries[0].id, b.entries[0].id], categoryId: a.technique.id });
    expect(mixed.updated.map((e) => e.id)).toEqual([a.entries[0].id]);
    expect(mixed.notFound).toEqual([b.entries[0].id]);
    expect((await prisma.knowledgeEntry.findUnique({ where: { id: b.entries[0].id } }))?.categoryId).toBeNull();

    // A category of vault B can't be used in vault A.
    await expect(
      assignEntriesToCategory({ knowledgeBaseId: a.kb.id, entryIds: [a.entries[0].id], categoryId: b.technique.id })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await prisma.knowledgeEntry.findUnique({ where: { id: a.entries[0].id } }))?.categoryId).toBe(a.technique.id);
  });

  it("pages through every entry, drafts included, with stable unique ids", async () => {
    const { kb } = await seedVault("Climb", 12);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof listEntriesPage>> = await listEntriesPage({ knowledgeBaseId: kb.id, filter: "uncategorized", cursor, limit: 5 });
      expect(page.total).toBe(12);
      seen.push(...page.entries.map((e) => e.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(12);
  });

  it("files new entries only under an existing category the model named exactly", async () => {
    const { kb, technique } = await seedVault("Climb", 0);
    expect((await resolveEntryCategory(kb.id, { category: "technique", topics: [] }))?.id).toBe(technique.id);
    expect(await resolveEntryCategory(kb.id, { category: "Made-up Category", topics: [] })).toBeNull();
    expect(await resolveEntryCategory(kb.id, { category: null, topics: ["unrelated"] })).toBeNull();
    expect(await prisma.knowledgeCategory.count({ where: { knowledgeBaseId: kb.id } })).toBe(2);
  });

  it("PATCH /entries assigns in bulk, 404s a foreign category, and 400s a bad body", async () => {
    const a = await seedVault("A", 2);
    const b = await seedVault("B", 1);
    const { PATCH } = await import("@/app/api/knowledge-bases/[id]/entries/route");
    const call = (body: unknown) =>
      PATCH(new NextRequest(`http://localhost/api/knowledge-bases/${a.kb.id}/entries`, { method: "PATCH", body: JSON.stringify(body) }), {
        params: Promise.resolve({ id: a.kb.id }),
      });

    const res = await call({ entryIds: a.entries.map((e) => e.id), categoryId: a.community.id });
    expect(res.status).toBe(200);
    expect((await res.json()).data.updated).toHaveLength(2);
    expect(await prisma.knowledgeEntry.count({ where: { categoryId: a.community.id } })).toBe(2);

    expect((await call({ entryIds: [a.entries[0].id], categoryId: b.community.id })).status).toBe(404);
    expect((await call({ entryIds: [], categoryId: null })).status).toBe(400);
  });
});

describe("AI Assistant entry organization", () => {
  beforeEach(async () => {
    await resetDb();
    mockCreate.mockReset();
  });

  const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ content: [{ type: "tool_use", id, name, input }] });
  const text = (t: string) => ({ content: [{ type: "text", text: t }] });

  it("lists every page of uncategorized entries, then persists the assignments it makes", async () => {
    const { kb, technique, entries } = await seedVault("Climb", 30); // > one page of 25
    const { answerAssistantQuestion } = await import("@/lib/ai/assistant-agent");
    const toolResults: string[] = [];
    mockCreate.mockImplementation(async (req: { messages: Array<{ role: string; content: unknown }> }) => {
      const last = req.messages[req.messages.length - 1];
      if (Array.isArray(last.content)) toolResults.push(String((last.content[0] as { content: string }).content));
      const step = toolResults.length;
      if (step === 0) return toolUse("t1", "list_entries", { filter: "uncategorized" });
      if (step === 1) {
        const cursor = /cursor="([^"]+)"/.exec(toolResults[0])?.[1];
        return toolUse("t2", "list_entries", { filter: "uncategorized", cursor });
      }
      if (step === 2) return toolUse("t3", "assign_entries_to_category", { categoryId: technique.id, entryIds: entries.map((e) => e.id) });
      return text("Done.");
    });

    await answerAssistantQuestion({
      knowledgeBases: [{ id: kb.id, name: kb.name, userGoal: kb.userGoal }],
      currentKnowledgeBaseId: kb.id,
      message: "Organize all uncategorized entries in this vault",
      history: [],
      relevantEntries: [],
      recentInsights: [],
    });

    expect(toolResults[0]).toMatch(/This page has 25 of 30 uncategorized entries/);
    expect(toolResults[0]).toMatch(/MORE ENTRIES REMAIN/);
    expect(toolResults[1]).toMatch(/This page has 5 of 30/);
    expect(toolResults[1]).toMatch(/End of list/);
    const listed = new Set([...toolResults[0].matchAll(/id=(\S+)/g), ...toolResults[1].matchAll(/id=(\S+)/g)].map((m) => m[1]));
    expect(listed.size).toBe(30);
    expect(toolResults[2]).toMatch(/^Saved\. Category set to "Technique" for 30 entries/);
    expect(await prisma.knowledgeEntry.count({ where: { categoryId: technique.id, status: "DRAFT" } })).toBe(30);
  });

  it("can't touch another vault's entries, and refuses when no vault is open", async () => {
    const a = await seedVault("A", 1);
    const b = await seedVault("B", 1);
    const { buildAssistantTools } = await import("@/lib/ai/assistant-tools");

    const scopedToA = buildAssistantTools({ onProposeKnowledgeBase: () => {}, currentKnowledgeBaseId: a.kb.id });
    const crossVault = await scopedToA.execute("assign_entries_to_category", { categoryId: a.technique.id, entryIds: [b.entries[0].id] });
    expect(crossVault).toMatch(/NOT changed — not entries of this knowledge vault/);
    const foreignCategory = await scopedToA.execute("assign_entries_to_category", { categoryId: b.technique.id, entryIds: [a.entries[0].id] });
    expect(foreignCategory).toMatch(/^FAILED — nothing was changed/);
    expect(await prisma.knowledgeEntry.count({ where: { categoryId: { not: null } } })).toBe(0);

    const noVault = buildAssistantTools({ onProposeKnowledgeBase: () => {} });
    expect(await noVault.execute("list_entries", { filter: "all" })).toMatch(/aren't viewing one/);
  });

  it("reports changes already saved if it runs out of steps, instead of a generic failure", async () => {
    const { kb, technique, entries } = await seedVault("Climb", 2);
    const { answerAssistantQuestion } = await import("@/lib/ai/assistant-agent");
    let n = 0;
    mockCreate.mockImplementation(async () =>
      n++ === 0
        ? toolUse("t1", "assign_entries_to_category", { categoryId: technique.id, entryIds: [entries[0].id] })
        : toolUse(`t${n}`, "list_categories", {})
    );
    const answer = await answerAssistantQuestion({
      knowledgeBases: [{ id: kb.id, name: kb.name, userGoal: kb.userGoal }],
      currentKnowledgeBaseId: kb.id,
      message: "Move entry 0 to Technique",
      history: [],
      relevantEntries: [],
      recentInsights: [],
    });
    expect(answer.reply).toMatch(/These changes were already saved/);
    expect(answer.reply).toMatch(/"Technique" for 1 entry/);
  });
});
