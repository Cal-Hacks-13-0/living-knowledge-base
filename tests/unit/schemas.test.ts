import { describe, it, expect } from "vitest";
import {
  SetupQuestionsResponseSchema,
  BlueprintResponseSchema,
  ComparisonResponseSchema,
  InsightResponseSchema,
} from "@/lib/ai/schemas";

describe("SetupQuestionsResponseSchema", () => {
  it("accepts a valid set of up to 3 questions", () => {
    const result = SetupQuestionsResponseSchema.safeParse({
      questions: [
        { id: "goal", prompt: "What is your primary goal?", type: "single_select", options: ["Learn", "Build"] },
        { id: "exp", prompt: "Experience level?", type: "short_text" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 3 questions", () => {
    const result = SetupQuestionsResponseSchema.safeParse({
      questions: Array.from({ length: 4 }, (_, i) => ({
        id: `q${i}`,
        prompt: "question",
        type: "short_text",
      })),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid question type", () => {
    const result = SetupQuestionsResponseSchema.safeParse({
      questions: [{ id: "q1", prompt: "question", type: "yes_no" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("BlueprintResponseSchema", () => {
  const validBlueprint = {
    name: "Full-Stack Radar",
    description: "Tracks full-stack web development.",
    categories: [{ name: "Frontend", description: "UI frameworks", subtopics: [{ name: "React", description: "" }] }],
    researchPriorities: ["Framework releases"],
    sources: [{ name: "React blog", url: "https://react.dev", type: "RSS", verified: false, rationale: "guess" }],
    monitoringFrequency: "WEEKLY",
    maintenanceRules: ["Flag anything older than 2 years"],
  };

  it("accepts a well-formed blueprint", () => {
    expect(BlueprintResponseSchema.safeParse(validBlueprint).success).toBe(true);
  });

  it("requires at least one category", () => {
    const result = BlueprintResponseSchema.safeParse({ ...validBlueprint, categories: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown source type", () => {
    const result = BlueprintResponseSchema.safeParse({
      ...validBlueprint,
      sources: [{ name: "x", url: "https://x.com", type: "PODCAST", verified: false }],
    });
    expect(result.success).toBe(false);
  });

  it("defaults monitoringFrequency when omitted", () => {
    const { monitoringFrequency, ...rest } = validBlueprint;
    void monitoringFrequency;
    const result = BlueprintResponseSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.monitoringFrequency).toBe("WEEKLY");
  });
});

describe("ComparisonResponseSchema", () => {
  it("accepts all five classifications", () => {
    for (const classification of ["DUPLICATE", "EXTENSION", "CONTRADICTION", "REPLACEMENT_CANDIDATE", "UNRELATED"]) {
      const result = ComparisonResponseSchema.safeParse({
        classification,
        noveltyScore: 0.5,
        explanation: "because",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an out-of-range novelty score", () => {
    const result = ComparisonResponseSchema.safeParse({
      classification: "EXTENSION",
      noveltyScore: 1.5,
      explanation: "because",
    });
    expect(result.success).toBe(false);
  });
});

describe("InsightResponseSchema", () => {
  it("allows zero insights", () => {
    expect(InsightResponseSchema.safeParse({ insights: [] }).success).toBe(true);
  });

  it("rejects more than 3 insights", () => {
    const insight = {
      title: "t",
      type: "NEW_DISCOVERY",
      summary: "s",
      whyItMatters: "w",
      recommendedAction: "a",
      confidence: 0.5,
    };
    const result = InsightResponseSchema.safeParse({ insights: [insight, insight, insight, insight] });
    expect(result.success).toBe(false);
  });
});
