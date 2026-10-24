import { findRelevantEntries } from "./repository";
import { compareKnowledge } from "@/lib/ai/comparison-agent";
import type { ExtractionResponse, ComparisonResponse } from "@/lib/ai/schemas";

/**
 * Retrieves relevant existing knowledge and runs the Comparison Agent against
 * it for a single extracted document. Thin orchestration glue between the
 * knowledge repository and the AI comparison agent.
 */
export async function compareAgainstExisting(
  knowledgeBaseId: string,
  extraction: ExtractionResponse
): Promise<{ comparison: ComparisonResponse; candidates: Array<{ id: string; title: string; summary: string }> }> {
  const entries = await findRelevantEntries(knowledgeBaseId, extraction.topics);
  const candidates = entries.map((e) => ({ id: e.id, title: e.title, summary: e.summary }));
  const comparison = await compareKnowledge({ extraction, existingEntries: candidates });
  return { comparison, candidates };
}
