import { listInboxEvents } from "@/lib/inbox/events";
import { currentWeekRange, weekStats } from "@/lib/inbox/digest";
import { listSourceIssues } from "@/lib/inbox/source-issues";
import { InboxView, type InboxFeedEvent } from "@/components/inbox/inbox-view";

/**
 * The Inbox: a system-generated feed of changes across the workspace's
 * knowledge vaults (lib/inbox/events.ts), led by a handful of AI-written
 * findings and an on-demand full review (lib/inbox/digest.ts). Nothing here
 * is typed by the user; events are recorded by the research pipeline, the AI
 * Assistant's archive tool, and proposal reviews.
 */
export default async function InboxPage() {
  const range = currentWeekRange();
  const [events, sourceIssues] = await Promise.all([listInboxEvents(), listSourceIssues()]);
  const thisWeek = events.filter((e) => e.occurredAt >= range.start);

  const feed: InboxFeedEvent[] = events.map((e) => ({
    id: e.id,
    category: e.category,
    status: e.status,
    title: e.title,
    description: e.description,
    origin: e.origin,
    sourceName: e.sourceName,
    sourceUrl: e.sourceUrl,
    evidence: e.evidence,
    beforeContent: e.beforeContent,
    afterContent: e.afterContent,
    occurredAt: e.occurredAt.toISOString(),
    resolvedAt: e.resolvedAt?.toISOString() ?? null,
    proposalId: e.proposalId,
    vault: e.knowledgeBase,
    note: e.knowledgeEntry,
  }));

  return (
    <InboxView
      events={feed}
      range={{ start: range.start.toISOString(), end: range.end.toISOString() }}
      stats={weekStats(thisWeek)}
      sourceIssues={sourceIssues}
    />
  );
}
