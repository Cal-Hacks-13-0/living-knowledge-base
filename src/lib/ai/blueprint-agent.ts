import { generateStructured } from "./client";
import { BlueprintResponseSchema, type BlueprintResponse } from "./schemas";
import { discoverVerifiedSources } from "@/lib/research/source-discovery";
import { isHackerNewsSource } from "@/lib/research/known-sources";
import type { OnboardingAnswer } from "./schemas";

const SYSTEM_PROMPT = `You are the Blueprint Agent for "Axion". You turn a user's
goal plus their onboarding answers into a structured, editable knowledge vault blueprint.
You are completely domain-agnostic: the same logic must work for software development,
freediving, bubble tea entrepreneurship, or any other topic.

Produce:
- A short, specific knowledge vault name and a one-paragraph description.
- 3-7 top-level categories, each with a description and 0-5 subtopics.
- 3-6 research priorities (what matters most to monitor, in priority order).
- 3-8 candidate external sources (RSS feeds, GitHub repos for software projects, or
  public HTML pages like official docs/government pages). For EVERY source you propose,
  set verified: false and explain your rationale — you cannot browse the web, so you must
  never claim a URL is confirmed live or invent an authoritative-looking URL. Prefer
  describing well-known, named publications/organizations over fabricating exact paths.
- A monitoring frequency recommendation (MANUAL, DAILY, WEEKLY, or MONTHLY) based on how fast the
  domain changes.
- 2-5 knowledge maintenance rules (e.g. "flag claims older than 2 years for review",
  "prefer official sources over blogs when contradictions appear").

Never invent a precise URL and claim it is verified. Be concrete about categories —
avoid generic filler like "Miscellaneous".`;

export interface OnboardingPreferences {
  monitoringFrequency?: string;
  sourceTypes?: string[];
  additionalNotes?: string;
}

export async function generateBlueprint(
  userGoal: string,
  answers: OnboardingAnswer[],
  preferences: OnboardingPreferences = {}
): Promise<BlueprintResponse> {
  const preferenceLines: string[] = [];
  if (preferences.monitoringFrequency) {
    preferenceLines.push(`- Preferred monitoring frequency: ${preferences.monitoringFrequency}`);
  }
  if (preferences.sourceTypes && preferences.sourceTypes.length > 0) {
    preferenceLines.push(`- Preferred source types: ${preferences.sourceTypes.join(", ")}`);
  }
  if (preferences.additionalNotes) {
    preferenceLines.push(`- Additional notes: ${preferences.additionalNotes}`);
  }

  const prompt = `User's goal: "${userGoal}"

Onboarding answers:
${
  answers.length > 0
    ? answers
        .map((a) => `- ${a.prompt}: ${Array.isArray(a.answer) ? a.answer.join(", ") : a.answer}`)
        .join("\n")
    : "(none provided)"
}

User preferences (weight these when choosing categories, sources, and monitoring frequency):
${preferenceLines.length > 0 ? preferenceLines.join("\n") : "(none provided — use your best judgment)"}

Call the emit_result tool with the full blueprint as specified.`;

  const aiResult = await generateStructured({
    system: SYSTEM_PROMPT,
    prompt,
    schema: BlueprintResponseSchema,
    toolName: "emit_result",
    maxTokens: 3072,
  });

  // Merge in deterministic, real sources so the blueprint always contains at
  // least a few sources that genuinely fetch content, regardless of what the
  // model proposed.
  // Hacker News isn't offered in the wizard's source step, even if the model suggests it.
  aiResult.sources = aiResult.sources.filter((s) => !isHackerNewsSource(s));
  const categoryNames = aiResult.categories.map((c) => c.name);
  const verifiedSources = discoverVerifiedSources(userGoal, categoryNames);
  const existingUrls = new Set(aiResult.sources.map((s) => s.url.toLowerCase()));
  for (const source of verifiedSources) {
    if (!existingUrls.has(source.url.toLowerCase())) {
      aiResult.sources.push(source);
      existingUrls.add(source.url.toLowerCase());
    }
  }

  return aiResult;
}
