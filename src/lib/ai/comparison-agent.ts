import { generateStructured } from "./client";
import { ComparisonResponseSchema, type ComparisonResponse } from "./schemas";
import type { ExtractionResponse } from "./schemas";

const SYSTEM_PROMPT = `You are the Knowledge Comparison Agent for "Axion". You
compare newly extracted information against a set of existing knowledge entries and
classify the relationship.

Classifications:
- DUPLICATE: says the same thing as an existing entry, no new information.
- EXTENSION: adds new detail/nuance to an existing entry without conflicting with it.
- CONTRADICTION: directly conflicts with an existing entry's claims.
- REPLACEMENT_CANDIDATE: suggests an existing entry may need to be updated or superseded.
- UNRELATED: does not meaningfully relate to any existing entry (may still be a new
  discovery worth storing on its own).

Important judgment rules:
- A different or later publication date alone does NOT prove older information is
  outdated. Consider whether the underlying facts actually changed.
- Consider framework/product versions, geography, and applicability/context before
  concluding something contradicts or replaces existing knowledge.
- Never propose silently overwriting existing knowledge. If you classify something as
  CONTRADICTION or REPLACEMENT_CANDIDATE, propose a change but both sides of a
  contradiction must be preserved for human review (the proposedChange is a suggestion,
  not an automatic overwrite).
- If nothing closely relates, classification is UNRELATED and relatedEntryId is null.`;

export async function compareKnowledge({
  extraction,
  existingEntries,
}: {
  extraction: ExtractionResponse;
  existingEntries: Array<{ id: string; title: string; summary: string }>;
}): Promise<ComparisonResponse> {
  const prompt = `New extracted information:
Summary: ${extraction.summary}
Key claims: ${extraction.keyClaims.join("; ") || "(none)"}
Topics: ${extraction.topics.join(", ") || "(none)"}

Existing knowledge entries (id | title | summary):
${
  existingEntries.length > 0
    ? existingEntries
        .map((e) => `${e.id} | ${e.title} | ${e.summary}`)
        .join("\n")
    : "(no existing entries in this knowledge vault yet)"
}

Call the emit_result tool with your classification. If you reference relatedEntryId, it
must be exactly one of the ids listed above, otherwise use null.`;

  return generateStructured({
    system: SYSTEM_PROMPT,
    prompt,
    schema: ComparisonResponseSchema,
    toolName: "emit_result",
    maxTokens: 1536,
  });
}
