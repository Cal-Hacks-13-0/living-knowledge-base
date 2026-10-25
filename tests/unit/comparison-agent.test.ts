import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

import { compareKnowledge } from "@/lib/ai/comparison-agent";

function toolResponse(input: Record<string, unknown>) {
  return {
    content: [{ type: "tool_use", id: "t1", name: "emit_result", input }],
  };
}

describe("compareKnowledge (Comparison Agent)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("classifies genuinely new information as UNRELATED when nothing matches", async () => {
    mockCreate.mockResolvedValue(
      toolResponse({
        classification: "UNRELATED",
        noveltyScore: 0.9,
        explanation: "No existing entry discusses this topic.",
        relatedEntryId: null,
        proposedChange: null,
      })
    );

    const result = await compareKnowledge({
      extraction: {
        summary: "A new framework was released.",
        keyClaims: ["Framework X released v2"],
        topics: ["frameworks"],
        entities: [],
        publishedAt: null,
        excerpts: [],
        isRelevant: true,
        category: null,
      },
      existingEntries: [],
    });

    expect(result.classification).toBe("UNRELATED");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("classifies conflicting claims as CONTRADICTION and preserves both sides via proposedChange", async () => {
    mockCreate.mockResolvedValue(
      toolResponse({
        classification: "CONTRADICTION",
        noveltyScore: 0.7,
        explanation: "New source says the opposite of the existing entry.",
        relatedEntryId: "entry-1",
        proposedChange: {
          operation: "UPDATE",
          proposedTitle: "Updated claim",
          proposedSummary: "The new, conflicting summary.",
          proposedContent: "Full conflicting content.",
        },
      })
    );

    const result = await compareKnowledge({
      extraction: {
        summary: "Claims the opposite of entry-1.",
        keyClaims: ["X is false"],
        topics: ["x"],
        entities: [],
        publishedAt: null,
        excerpts: [],
        isRelevant: true,
        category: null,
      },
      existingEntries: [{ id: "entry-1", title: "X is true", summary: "X is true, established fact." }],
    });

    expect(result.classification).toBe("CONTRADICTION");
    expect(result.relatedEntryId).toBe("entry-1");
    expect(result.proposedChange?.operation).toBe("UPDATE");
  });

  it("throws if the model never returns a valid tool_use block matching the schema", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "I refuse to use the tool." }] });

    await expect(
      compareKnowledge({
        extraction: {
          summary: "x",
          keyClaims: [],
          topics: [],
          entities: [],
          publishedAt: null,
          excerpts: [],
          isRelevant: true,
          category: null,
        },
        existingEntries: [],
      })
    ).rejects.toThrow();
  });
});
