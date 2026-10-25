import { prisma } from "@/lib/db/prisma";
import { createDraftEntry, matchCategoryByTopics } from "./repository";
import { createChangeProposal } from "./versioning";
import type { ComparisonResponse, ExtractionResponse } from "@/lib/ai/schemas";

/**
 * Applies the Comparison Agent's classification to one extracted document —
 * the "knowledge update rules" (see README §8): safe to auto-apply (new
 * drafts) vs. unsafe operations that become a proposal awaiting review.
 * Shared by the research orchestrator's per-document loop and the AI
 * Assistant's "archive this URL" tool so both paths apply identical rules.
 */
export type ClassificationOutcome =
  | { action: "duplicate" }
  | { action: "created_entry"; entryId: string; title: string; categoryName: string | null }
  | { action: "created_proposal"; proposalId: string; operation: string; targetEntryTitle: string | null };

export async function applyComparisonClassification({
  knowledgeBaseId,
  title,
  extraction,
  comparison,
  sourceDocumentId,
}: {
  knowledgeBaseId: string;
  title: string;
  extraction: ExtractionResponse;
  comparison: ComparisonResponse;
  sourceDocumentId: string;
}): Promise<ClassificationOutcome> {
  if (comparison.classification === "DUPLICATE") {
    return { action: "duplicate" };
  }

  if (comparison.classification === "UNRELATED" || comparison.classification === "EXTENSION") {
    const category = await matchCategoryByTopics(knowledgeBaseId, extraction.topics);
    const entry = await createDraftEntry({
      knowledgeBaseId,
      categoryId: category?.id ?? null,
      title,
      summary: extraction.summary,
      content: extraction.keyClaims.join("\n") || extraction.summary,
      sourceDocumentId,
    });
    return { action: "created_entry", entryId: entry.id, title: entry.title, categoryName: category?.name ?? null };
  }

  // CONTRADICTION or REPLACEMENT_CANDIDATE — never auto-applied.
  let targetEntryTitle: string | null = null;
  if (comparison.relatedEntryId) {
    const target = await prisma.knowledgeEntry.findUnique({ where: { id: comparison.relatedEntryId } });
    targetEntryTitle = target?.title ?? null;
  }

  const proposal = await createChangeProposal({
    knowledgeBaseId,
    insightId: null,
    targetEntryId: comparison.relatedEntryId,
    operation: comparison.proposedChange?.operation ?? "UPDATE",
    proposed: {
      title: comparison.proposedChange?.proposedTitle ?? title,
      summary: comparison.proposedChange?.proposedSummary ?? extraction.summary,
      content: comparison.proposedChange?.proposedContent ?? extraction.summary,
    },
    explanation: comparison.explanation,
  });
  return {
    action: "created_proposal",
    proposalId: proposal.id,
    operation: proposal.operation,
    targetEntryTitle,
  };
}
