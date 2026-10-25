import { prisma } from "@/lib/db/prisma";
import type { ProposalOperation } from "@prisma/client";
import { resolveProposalEvent } from "@/lib/inbox/events";

export interface ProposedContentPayload {
  operation: ProposalOperation;
  previous: { title: string; summary: string; content: string; status: string } | null;
  proposed: { title: string; summary: string; content: string };
  explanation: string;
}

export async function createChangeProposal(input: {
  knowledgeBaseId: string;
  insightId: string | null;
  targetEntryId: string | null;
  operation: ProposalOperation;
  proposed: { title: string; summary: string; content: string };
  explanation: string;
}) {
  let previous: ProposedContentPayload["previous"] = null;
  if (input.targetEntryId) {
    const entry = await prisma.knowledgeEntry.findUnique({ where: { id: input.targetEntryId } });
    if (entry) {
      previous = {
        title: entry.title,
        summary: entry.summary,
        content: entry.content,
        status: entry.status,
      };
    }
  }

  const payload: ProposedContentPayload = {
    operation: input.operation,
    previous,
    proposed: input.proposed,
    explanation: input.explanation,
  };

  return prisma.knowledgeChangeProposal.create({
    data: {
      knowledgeBaseId: input.knowledgeBaseId,
      insightId: input.insightId,
      targetEntryId: input.targetEntryId,
      operation: input.operation,
      proposedContent: JSON.stringify(payload),
      status: "PENDING",
    },
  });
}

/**
 * Applies an approved proposal transactionally. The previous version of the
 * target entry (if any) is already captured inside proposedContent, so
 * rejecting-after-approval ("rollback") is possible by re-reading that
 * snapshot and re-applying it — the proposal row itself is the audit trail.
 */
export async function approveProposal(proposalId: string) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.knowledgeChangeProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.status !== "PENDING") throw new Error("Proposal already reviewed");

    const payload: ProposedContentPayload = JSON.parse(proposal.proposedContent);

    if (proposal.targetEntryId) {
      switch (proposal.operation) {
        case "UPDATE":
        case "MERGE":
          await tx.knowledgeEntry.update({
            where: { id: proposal.targetEntryId },
            data: {
              title: payload.proposed.title,
              summary: payload.proposed.summary,
              content: payload.proposed.content,
              status: "VERIFIED",
            },
          });
          break;
        case "MARK_OBSOLETE":
          await tx.knowledgeEntry.update({
            where: { id: proposal.targetEntryId },
            data: { status: "OUTDATED" },
          });
          break;
        case "DELETE":
          await tx.knowledgeEntry.update({
            where: { id: proposal.targetEntryId },
            data: { status: "SUPERSEDED" },
          });
          break;
        case "CREATE":
          // No-op on the target entry; CREATE proposals are informational only.
          break;
      }
    }

    const approved = await tx.knowledgeChangeProposal.update({
      where: { id: proposalId },
      data: { status: "APPROVED", reviewedAt: new Date() },
    });
    // Same transaction: the Inbox only says "applied" if the entry change committed.
    await resolveProposalEvent(proposalId, "APPLIED", tx);
    return approved;
  });
}

export async function rejectProposal(proposalId: string) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.knowledgeChangeProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.status !== "PENDING") throw new Error("Proposal already reviewed");
    const rejected = await tx.knowledgeChangeProposal.update({
      where: { id: proposalId },
      data: { status: "REJECTED", reviewedAt: new Date() },
    });
    await resolveProposalEvent(proposalId, "DECLINED", tx);
    return rejected;
  });
}
