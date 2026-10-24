import { z } from "zod";

// ---------------------------------------------------------------------------
// Agent 1 — Setup Agent
// ---------------------------------------------------------------------------

export const QuestionTypeSchema = z.enum([
  "single_select",
  "multi_select",
  "short_text",
]);

export const SetupQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  type: QuestionTypeSchema,
  options: z.array(z.string()).optional().default([]),
});

export const SetupQuestionsResponseSchema = z.object({
  questions: z.array(SetupQuestionSchema).max(3),
});

export type SetupQuestion = z.infer<typeof SetupQuestionSchema>;
export type SetupQuestionsResponse = z.infer<typeof SetupQuestionsResponseSchema>;

export const OnboardingAnswerSchema = z.object({
  questionId: z.string(),
  prompt: z.string(),
  answer: z.union([z.string(), z.array(z.string())]),
});
export type OnboardingAnswer = z.infer<typeof OnboardingAnswerSchema>;

// ---------------------------------------------------------------------------
// Agent 2 — Blueprint Agent
// ---------------------------------------------------------------------------

export const SourceTypeSchema = z.enum(["RSS", "GITHUB_RELEASES", "HTML"]);
export const MonitoringFrequencySchema = z.enum(["MANUAL", "DAILY", "WEEKLY", "MONTHLY"]);

export const BlueprintCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  subtopics: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().default(""),
      })
    )
    .default([]),
});

export const BlueprintSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  type: SourceTypeSchema,
  verified: z.boolean().default(false),
  rationale: z.string().default(""),
});

export const BlueprintResponseSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  categories: z.array(BlueprintCategorySchema).min(1),
  researchPriorities: z.array(z.string()).default([]),
  sources: z.array(BlueprintSourceSchema).default([]),
  monitoringFrequency: MonitoringFrequencySchema.default("WEEKLY"),
  maintenanceRules: z.array(z.string()).default([]),
});

export type BlueprintResponse = z.infer<typeof BlueprintResponseSchema>;
export type BlueprintCategory = z.infer<typeof BlueprintCategorySchema>;
export type BlueprintSource = z.infer<typeof BlueprintSourceSchema>;

// ---------------------------------------------------------------------------
// Agent 3 — Extraction Agent
// ---------------------------------------------------------------------------

export const ExtractionResponseSchema = z.object({
  summary: z.string().min(1),
  keyClaims: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  entities: z.array(z.string()).default([]),
  publishedAt: z.string().nullable().default(null),
  excerpts: z.array(z.string()).default([]),
  isRelevant: z.boolean().default(true),
});
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;

// ---------------------------------------------------------------------------
// Agent 4 — Knowledge Comparison Agent
// ---------------------------------------------------------------------------

export const ComparisonClassificationSchema = z.enum([
  "DUPLICATE",
  "EXTENSION",
  "CONTRADICTION",
  "REPLACEMENT_CANDIDATE",
  "UNRELATED",
]);

export const ProposalOperationSchema = z.enum([
  "CREATE",
  "UPDATE",
  "MERGE",
  "DELETE",
  "MARK_OBSOLETE",
]);

export const ComparisonResponseSchema = z.object({
  classification: ComparisonClassificationSchema,
  noveltyScore: z.number().min(0).max(1),
  explanation: z.string().min(1),
  relatedEntryId: z.string().nullable().default(null),
  proposedChange: z
    .object({
      operation: ProposalOperationSchema,
      proposedTitle: z.string(),
      proposedSummary: z.string(),
      proposedContent: z.string(),
    })
    .nullable()
    .default(null),
});
export type ComparisonResponse = z.infer<typeof ComparisonResponseSchema>;

// ---------------------------------------------------------------------------
// Agent 5 — Insight Agent
// ---------------------------------------------------------------------------

export const InsightTypeSchema = z.enum([
  "NEW_DISCOVERY",
  "KNOWLEDGE_EXTENSION",
  "CONTRADICTION",
  "OUTDATED_INFORMATION",
  "ACTIONABLE_OPPORTUNITY",
]);

export const InsightCandidateSchema = z.object({
  title: z.string().min(1),
  type: InsightTypeSchema,
  summary: z.string().min(1),
  whyItMatters: z.string().min(1),
  recommendedAction: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidenceDocumentIndexes: z.array(z.number().int()).default([]),
  relatedEntryId: z.string().nullable().default(null),
});

export const InsightResponseSchema = z.object({
  insights: z.array(InsightCandidateSchema).max(3),
});
export type InsightCandidate = z.infer<typeof InsightCandidateSchema>;
export type InsightResponse = z.infer<typeof InsightResponseSchema>;
