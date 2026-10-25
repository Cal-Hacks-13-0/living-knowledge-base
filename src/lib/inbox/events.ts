import type { InboxEventCategory, InboxEventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { currentWorkspaceId } from "@/lib/workspace";

/**
 * Inbox events: the persistent record behind the Inbox feed. Written by the
 * code that actually makes (or proposes) a change, and only after that change
 * succeeded:
 * - knowledge/classification.ts — new draft entries from a scan or the AI
 *   Assistant (EXTERNAL_DISCOVERY / SOURCE_REFRESH, applied) and correction
 *   proposals (CORRECTION, proposed).
 * - knowledge/versioning.ts — approving/rejecting a proposal moves its event
 *   to APPLIED/DECLINED in the same transaction as the entry update.
 * NEW_CONNECTION exists in the schema, but nothing in Axion links notes to
 * each other yet, so no events of that category are produced.
 */

export type InboxOrigin = "manual_scan" | "scheduled_scan" | "assistant_archive";

type Db = Prisma.TransactionClient | typeof prisma;

export interface RecordInboxEventInput {
  /** Stable per underlying change, e.g. `entry:<id>`; re-recording is a no-op. */
  dedupeKey: string;
  category: InboxEventCategory;
  status: InboxEventStatus;
  knowledgeBaseId: string;
  knowledgeEntryId?: string | null;
  proposalId?: string | null;
  title: string;
  description: string;
  origin: InboxOrigin;
  sourceName?: string | null;
  sourceUrl?: string | null;
  evidence?: string | null;
  beforeContent?: string | null;
  afterContent?: string | null;
}

/** Idempotent: a retried job that records the same change again leaves the original event untouched. */
export async function recordInboxEvent(input: RecordInboxEventInput, db: Db = prisma) {
  const workspaceId = currentWorkspaceId();
  return db.inboxEvent.upsert({
    where: { workspaceId_dedupeKey: { workspaceId, dedupeKey: input.dedupeKey } },
    update: {},
    create: { ...input, workspaceId, title: input.title.slice(0, 300) },
  });
}

/** Marks a proposal's event as applied or declined once the review has gone through. */
export async function resolveProposalEvent(proposalId: string, status: "APPLIED" | "DECLINED", db: Db = prisma) {
  return db.inboxEvent.updateMany({
    where: { workspaceId: currentWorkspaceId(), proposalId, status: "PROPOSED" },
    data: { status, resolvedAt: new Date() },
  });
}

/**
 * Best-effort wrapper for callers where the change itself already succeeded:
 * a failure to record the event is logged but never undoes or fails the change.
 */
export async function recordInboxEventSafe(input: RecordInboxEventInput) {
  try {
    await recordInboxEvent(input);
  } catch (err) {
    console.error(`[inbox] failed to record event ${input.dedupeKey}:`, err);
  }
}

export const inboxEventInclude = {
  knowledgeBase: { select: { id: true, name: true } },
  knowledgeEntry: { select: { id: true, title: true } },
} satisfies Prisma.InboxEventInclude;

export type InboxEventWithRefs = Prisma.InboxEventGetPayload<{ include: typeof inboxEventInclude }>;

export async function listInboxEvents({ since, limit = 200 }: { since?: Date; limit?: number } = {}) {
  return prisma.inboxEvent.findMany({
    where: { workspaceId: currentWorkspaceId(), ...(since ? { occurredAt: { gte: since } } : {}) },
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: inboxEventInclude,
  });
}
