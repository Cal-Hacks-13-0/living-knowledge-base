import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";
import { searchKnowledge, makeSnippet } from "@/lib/knowledge/search";

describe("global search", () => {
  beforeEach(resetDb);
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seed() {
    const freediving = await createTestKnowledgeBase({ name: "Freediving training" });
    const react = await createTestKnowledgeBase({ name: "Frontend notes" });
    await prisma.knowledgeEntry.create({
      data: {
        knowledgeBaseId: react.id,
        title: "Server Components overview",
        summary: "How rendering on the server works.",
        content: "Long body text. React Server Components stream HTML and keep data fetching on the server.",
      },
    });
    await prisma.knowledgeEntry.create({
      data: {
        knowledgeBaseId: freediving.id,
        title: "CO2 tables",
        summary: "Breath-hold training schedule.",
        content: "Static apnea practice.",
      },
    });
    return { freediving, react };
  }

  it("finds vaults by name, case-insensitively, with their entry count", async () => {
    const { freediving } = await seed();
    const { vaults, entries } = await searchKnowledge("  FREEDIVING ");
    expect(vaults.map((v) => v.id)).toEqual([freediving.id]);
    expect(vaults[0].entryCount).toBe(1);
    expect(entries).toEqual([]);
  });

  it("finds entries by body text with their parent vault and a snippet around the match", async () => {
    const { react } = await seed();
    const { entries } = await searchKnowledge("stream html");
    expect(entries).toHaveLength(1);
    expect(entries[0].knowledgeBase).toEqual({ id: react.id, name: "Frontend notes" });
    expect(entries[0].snippet.toLowerCase()).toContain("stream html");
    expect(entries[0]).not.toHaveProperty("content");
  });

  it("returns nothing for empty or unmatched queries", async () => {
    await seed();
    expect(await searchKnowledge("   ")).toEqual({ vaults: [], entries: [] });
    expect(await searchKnowledge("zzz-no-such-thing")).toEqual({ vaults: [], entries: [] });
  });

  it("makeSnippet centres on the match and marks truncation", () => {
    const text = `${"a ".repeat(100)}needle${" b".repeat(100)}`;
    const snippet = makeSnippet(text, "NEEDLE", 10);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("needle");
  });
});
