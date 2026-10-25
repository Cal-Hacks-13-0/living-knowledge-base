import { generateStructured } from "./client";
import { InsightResponseSchema, type InsightResponse } from "./schemas";
import type { ComparisonResponse, ExtractionResponse } from "./schemas";

const SYSTEM_PROMPT = `You are the Insight Agent for "Axion". Given everything
found during one research run, decide which findings are actually worth surfacing to the
user as insights.

Rank candidates by: relevance to the user's stated goal, novelty, potential impact, and
evidence quality. You are only called when the run contains at least one relevant,
non-duplicate new finding, so generate BETWEEN 1 AND 3 insights for the whole run. Never
return an empty insights array. Do NOT invent information or surface a generic restatement:
every insight must be grounded in one or more supplied findings.

Each insight must cite which finding(s) it is based on by index (evidenceDocumentIndexes)
and, if applicable, which existing knowledge entry it relates to (relatedEntryId).
Insight types:
- NEW_DISCOVERY: genuinely new information with no prior related entry.
- KNOWLEDGE_EXTENSION: adds meaningful depth to existing knowledge.
- CONTRADICTION: conflicts with existing knowledge (present it neutrally; do not declare
  a winner).
- OUTDATED_INFORMATION: strong evidence an existing entry is no longer accurate/applicable.
- ACTIONABLE_OPPORTUNITY: something the user could concretely act on given their goal.

In any text the user will read, call their collection a "knowledge vault" (never "knowledge base").`;

export interface InsightFinding {
  index: number;
  documentTitle: string;
  documentUrl: string;
  extraction: ExtractionResponse;
  comparison: ComparisonResponse;
}

export async function generateInsights({
  userGoal,
  preferences,
  findings,
  existingEntries,
}: {
  userGoal: string;
  preferences: Record<string, unknown>;
  findings: InsightFinding[];
  existingEntries: Array<{ id: string; title: string; summary: string }>;
}): Promise<InsightResponse> {
  if (findings.length === 0) {
    return { insights: [] };
  }

  const prompt = `User's goal: "${userGoal}"
User preferences: ${JSON.stringify(preferences)}

Findings from this research run (index | title | url | classification | novelty | summary):
${findings
  .map(
    (f) =>
      `[${f.index}] ${f.documentTitle} | ${f.documentUrl} | ${f.comparison.classification} | novelty=${f.comparison.noveltyScore} | ${f.extraction.summary}`
  )
  .join("\n")}

Existing knowledge entries (id | title | summary):
${
  existingEntries.length > 0
    ? existingEntries.map((e) => `${e.id} | ${e.title} | ${e.summary}`).join("\n")
    : "(none yet)"
}

Call the emit_result tool with 1 to 3 high-value insights. At least one insight is required
because the caller has already filtered this run down to relevant, non-duplicate findings.`;

  return generateStructured({
    system: SYSTEM_PROMPT,
    prompt,
    schema: InsightResponseSchema,
    toolName: "emit_result",
    maxTokens: 2048,
  });
}
