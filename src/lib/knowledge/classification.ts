import { prisma } from "@/lib/db/prisma";
import { createDraftEntry, resolveEntryCategory } from "./repository";
import { createChangeProposal } from "./versioning";
import type { ComparisonResponse, ExtractionResponse } from "@/lib/ai/schemas";
import { recordInboxEventSafe, type InboxOrigin } from "@/lib/inbox/events";

/**
 * Applies the Comparison Agent's classification to one extracted document —
 * the "knowledge update rules" (see README §8): safe to auto-apply (new
 * drafts) vs. unsafe operations that become a proposal awaiting review.
 * Shared by the research orchestrator's per-document loop and the AI
 * Assistant's "archive this URL" tool so both paths apply identical rules.
 * Each successful change is also recorded as an Inbox event (lib/inbox/events.ts).
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
  origin,
}: {
  knowledgeBaseId: string;
  title: string;
  extraction: ExtractionResponse;
  comparison: ComparisonResponse;
  sourceDocumentId: string;
  /** Where this document came from, for the Inbox event's provenance. */
  origin: InboxOrigin;
}): Promise<ClassificationOutcome> {
  if (comparison.classification === "DUPLICATE") {
    return { action: "duplicate" };
  }

  const sourceDocument = await prisma.sourceDocument.findUnique({
    where: { id: sourceDocumentId },
    select: { url: true, source: { select: { name: true } } },
  });
  const provenance = {
    origin,
    sourceName: sourceDocument?.source.name ?? null,
    sourceUrl: sourceDocument?.url ?? null,
  };
  const relatedEntry = comparison.relatedEntryId
    ? await prisma.knowledgeEntry.findUnique({
        where: { id: comparison.relatedEntryId },
        select: { id: true, title: true, summary: true, content: true },
      })
    : null;

  if (comparison.classification === "UNRELATED" || comparison.classification === "EXTENSION") {
    const category = await resolveEntryCategory(knowledgeBaseId, extraction);
    const entry = await createDraftEntry({
      knowledgeBaseId,
      categoryId: category?.id ?? null,
      title,
      summary: extraction.summary,
      content: extraction.keyClaims.join("\n") || extraction.summary,
      sourceDocumentId,
    });
    // An EXTENSION adds detail to something already known (a "source refresh");
    // UNRELATED is new ground. Either way it's a new draft entry, already saved.
    const extendsEntry = comparison.classification === "EXTENSION" && relatedEntry;
    await recordInboxEventSafe({
      dedupeKey: `entry:${entry.id}`,
      category: extendsEntry ? "SOURCE_REFRESH" : "EXTERNAL_DISCOVERY",
      status: "APPLIED",
      knowledgeBaseId,
      knowledgeEntryId: entry.id,
      title: extendsEntry ? `New details on “${relatedEntry.title}”: ${entry.title}` : `New note: ${entry.title}`,
      description: extraction.summary,
      evidence: comparison.explanation,
      ...provenance,
    });
    return { action: "created_entry", entryId: entry.id, title: entry.title, categoryName: category?.name ?? null };
  }

  // CONTRADICTION or REPLACEMENT_CANDIDATE — never auto-applied.
  const targetEntryTitle = relatedEntry?.title ?? null;

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
  const proposedText = comparison.proposedChange?.proposedContent ?? extraction.summary;
  await recordInboxEventSafe({
    dedupeKey: `proposal:${proposal.id}`,
    category: "CORRECTION",
    status: "PROPOSED",
    knowledgeBaseId,
    knowledgeEntryId: relatedEntry?.id ?? null,
    proposalId: proposal.id,
    title: targetEntryTitle ? `Proposed correction to “${targetEntryTitle}”` : `Proposed change from “${title}”`,
    description: comparison.explanation,
    evidence: extraction.summary,
    beforeContent: relatedEntry ? relatedEntry.content || relatedEntry.summary : null,
    afterContent: proposedText,
    ...provenance,
  });
  return {
    action: "created_proposal",
    proposalId: proposal.id,
    operation: proposal.operation,
    targetEntryTitle,
  };
}
