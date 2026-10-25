import { z } from "zod";
import { OnboardingAnswerSchema, MonitoringFrequencySchema, SourceTypeSchema } from "@/lib/ai/schemas";

// --- /api/setup/questions ---------------------------------------------------
export const SetupQuestionsRequestSchema = z.object({
  userGoal: z.string().min(3).max(500),
  previousAnswers: z.array(OnboardingAnswerSchema).default([]),
});

// --- /api/blueprints/generate -----------------------------------------------
export const BlueprintGenerateRequestSchema = z.object({
  userGoal: z.string().min(3).max(500),
  answers: z.array(OnboardingAnswerSchema).default([]),
  preferences: z
    .object({
      monitoringFrequency: MonitoringFrequencySchema.optional(),
      sourceTypes: z.array(z.string()).default([]),
      additionalNotes: z.string().default(""),
    })
    .default({ sourceTypes: [], additionalNotes: "" }),
});

// --- /api/knowledge-bases (POST) --------------------------------------------
export const CreateKnowledgeBaseRequestSchema = z.object({
  userGoal: z.string().min(3).max(500),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  preferences: z.record(z.string(), z.unknown()).default({}),
  monitoringFrequency: MonitoringFrequencySchema.default("WEEKLY"),
  categories: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().default(""),
        subtopics: z
          .array(z.object({ name: z.string().min(1).max(200), description: z.string().default("") }))
          .default([]),
      })
    )
    .min(1),
  sources: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        url: z.string().min(1).max(1000),
        type: SourceTypeSchema,
      })
    )
    .default([]),
});

// --- /api/knowledge-bases/:id (PATCH) ---------------------------------------
export const UpdateKnowledgeBaseRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  monitoringFrequency: MonitoringFrequencySchema.optional(),
});

// --- /api/knowledge-bases/:id/sources (POST) --------------------------------
export const CreateSourceRequestSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().min(1).max(1000),
  type: SourceTypeSchema,
});

// --- /api/knowledge-bases/:id/categories (POST) -----------------------------
export const CreateCategoryRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
});

// --- /api/insights/:id (PATCH) ----------------------------------------------
export const UpdateInsightRequestSchema = z.object({
  status: z.enum(["PENDING", "SAVED", "DISMISSED", "ACTIONED"]),
});

// --- /api/knowledge-bases/:id/chat (POST) -----------------------------------
// --- /api/assistant/chat (POST) ---------------------------------------------
export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .default([]),
  // The KB the user happens to be viewing, if any — a default hint for the
  // assistant's tools, not a hard scope. The assistant is global.
  currentKnowledgeBaseId: z.string().optional(),
});

export function validateUrl(rawUrl: string): { ok: true } | { ok: false; error: string } {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "URL must use http or https" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
}
