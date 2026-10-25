"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, ChevronDown, ExternalLink, Inbox as InboxIcon, Library, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { apiGet, apiPost, ApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export interface InboxFeedEvent {
  id: string;
  category: "EXTERNAL_DISCOVERY" | "CORRECTION" | "SOURCE_REFRESH" | "NEW_CONNECTION";
  status: "APPLIED" | "PROPOSED" | "DECLINED";
  title: string;
  description: string;
  origin: string;
  sourceName: string | null;
  sourceUrl: string | null;
  evidence: string | null;
  beforeContent: string | null;
  afterContent: string | null;
  occurredAt: string;
  resolvedAt: string | null;
  proposalId: string | null;
  vault: { id: string; name: string };
  note: { id: string; title: string } | null;
}

export interface InboxSourceIssue {
  id: string;
  name: string;
  url: string;
  lastError: string;
  vault: { id: string; name: string };
}

interface WeekStats {
  updates: number;
  vaults: number;
}

type DigestResponse<T> = { status: "empty"; stats: WeekStats } | { status: "ready"; stats: WeekStats; digest: T; cached: boolean };

interface Finding {
  statement: string;
  eventIds: string[];
}

interface ReviewSection {
  heading: string;
  body: string;
  eventIds: string[];
}

const CATEGORY_LABEL: Record<InboxFeedEvent["category"], string> = {
  EXTERNAL_DISCOVERY: "External discovery",
  CORRECTION: "Correction",
  SOURCE_REFRESH: "Source refresh",
  NEW_CONNECTION: "New connection",
};

const ORIGIN_LABEL: Record<string, string> = {
  manual_scan: "Research run",
  scheduled_scan: "Scheduled scan",
  assistant_archive: "Added via AI Assistant",
};

// The viewer's time zone, for "Today"/"Yesterday" and timestamps. The server
// renders in UTC; after hydration the client switches to the local zone.
const subscribeNever = () => () => {};
function useTimeZone() {
  return useSyncExternalStore(
    subscribeNever,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC"
  );
}

export function InboxView({
  events,
  range,
  stats,
  sourceIssues,
}: {
  events: InboxFeedEvent[];
  range: { start: string; end: string };
  stats: WeekStats;
  sourceIssues: InboxSourceIssue[];
}) {
  const reviewId = useId();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const toggleEvent = (id: string, open?: boolean) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  const byId = new Map(events.map((e) => [e.id, e]));
  const showEvent = (id: string) => {
    toggleEvent(id, true);
    document.getElementById(`event-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Inbox</h1>
        <p className="mt-1 text-sm text-muted">Your knowledge keeps moving. Here&apos;s what changed.</p>
      </div>

      {stats.updates > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <StatCard label="Updates" value={stats.updates} icon={<Activity className="h-3.5 w-3.5" />} />
          <StatCard
            label={stats.vaults === 1 ? "Knowledge vault" : "Knowledge vaults"}
            value={stats.vaults}
            icon={<Library className="h-3.5 w-3.5" />}
          />
        </div>
      )}

      <WeeklyFindings
        range={range}
        stats={stats}
        eventsById={byId}
        reviewOpen={reviewOpen}
        reviewId={reviewId}
        onToggleReview={() => setReviewOpen((o) => !o)}
        onShowEvent={showEvent}
      />

      {reviewOpen && (
        <WeeklyReview id={reviewId} eventsById={byId} onCollapse={() => setReviewOpen(false)} onShowEvent={showEvent} />
      )}

      <section className="mt-8 rounded-2xl border border-border bg-card px-5 pb-2 pt-4" aria-labelledby="all-updates">
        <h2 id="all-updates" className="mb-2 text-sm font-semibold text-foreground">
          All updates
        </h2>
        {events.length === 0 ? (
          <EmptyState
            icon={<InboxIcon className="h-5 w-5" />}
            title="No updates yet"
            description="When research runs discover something new, or a note needs correcting, it will appear here automatically."
          />
        ) : (
          <Feed events={events} openIds={openIds} onToggle={toggleEvent} />
        )}
      </section>

      <SourceIssues issues={sourceIssues} />
    </div>
  );
}

/**
 * The 2-3 findings a user actually needs to read to understand their week —
 * generated by the Findings Agent (lib/inbox/digest.ts) from this week's
 * real Inbox events, each citing the exact event(s) it's based on so every
 * sentence stays traceable. A finding backed by one sourced event is itself
 * the link to that source; one backed by several opens a compact citation
 * list instead of arbitrarily picking one. The full weekly review is a
 * separate, lower-priority digest reachable from here, not duplicated here.
 */
function WeeklyFindings({
  range,
  stats,
  eventsById,
  reviewOpen,
  reviewId,
  onToggleReview,
  onShowEvent,
}: {
  range: { start: string; end: string };
  stats: WeekStats;
  eventsById: Map<string, InboxFeedEvent>;
  reviewOpen: boolean;
  reviewId: string;
  onToggleReview: () => void;
  onShowEvent: (eventId: string) => void;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; overview: string; findings: Finding[] }
    | { kind: "empty" }
    | { kind: "unavailable" }
  >(stats.updates === 0 ? { kind: "empty" } : { kind: "loading" });

  useEffect(() => {
    if (stats.updates === 0) return;
    let cancelled = false;
    apiGet<DigestResponse<{ overview: string; findings: Finding[] }>>("/api/inbox/findings")
      .then((res) => {
        if (cancelled) return;
        setState(
          res.status === "ready" ? { kind: "ready", overview: res.digest.overview, findings: res.digest.findings } : { kind: "empty" }
        );
      })
      .catch(() => !cancelled && setState({ kind: "unavailable" }));
    return () => {
      cancelled = true;
    };
  }, [stats.updates]);

  // A finding can only cite events that still exist in the loaded feed
  // (listInboxEvents caps at 200) — anything else would be a dead end, so
  // it's dropped rather than rendered without working evidence.
  const findings =
    state.kind === "ready" ? state.findings.filter((f) => f.eventIds.some((id) => eventsById.has(id))) : [];

  return (
    <section
      aria-labelledby="week-heading"
      className="rounded-2xl border border-border bg-accent-soft px-5 py-5 backdrop-blur-md"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-strong">
        Your week, distilled
        <span className="font-medium normal-case tracking-normal text-muted">{formatRange(range.start, range.end)}</span>
      </p>
      <h2 id="week-heading" className="mt-1.5 text-lg font-semibold text-foreground">
        This week, in brief.
      </h2>

      <div className="mt-3" aria-live="polite">
        {state.kind === "loading" && (
          <div className="flex flex-col gap-4 py-1" aria-label="Looking for this week's findings">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        )}
        {state.kind === "ready" && (
          <>
            <p className="text-sm leading-relaxed text-foreground/90">{state.overview}</p>
            {findings.length > 0 && (
              <div className="mt-4 divide-y divide-border border-t border-border">
                {findings.map((finding, i) => (
                  <FindingRow key={i} finding={finding} eventsById={eventsById} onShowEvent={onShowEvent} />
                ))}
              </div>
            )}
          </>
        )}
        {state.kind === "empty" && (
          <p className="text-sm leading-relaxed text-muted">
            Nothing changed in your knowledge vaults this week. New discoveries and changes will show up here automatically.
          </p>
        )}
        {state.kind === "unavailable" && (
          <p className="text-sm leading-relaxed text-muted">
            {stats.updates} {stats.updates === 1 ? "update was" : "updates were"} recorded this week. The summary
            isn&apos;t available right now, but every update is listed below.
          </p>
        )}
      </div>

      {stats.updates > 0 && (
        <div className="mt-4 flex justify-end border-t border-border pt-3">
          <Button
            size="sm"
            onClick={onToggleReview}
            aria-expanded={reviewOpen}
            aria-controls={reviewOpen ? reviewId : undefined}
          >
            {reviewOpen ? "Hide full review" : "Read full review"}
            <ArrowRight className={cn("h-3.5 w-3.5 transition-transform", reviewOpen && "-rotate-90")} />
          </Button>
        </div>
      )}
    </section>
  );
}

function FindingRow({
  finding,
  eventsById,
  onShowEvent,
}: {
  finding: Finding;
  eventsById: Map<string, InboxFeedEvent>;
  onShowEvent: (eventId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const refs = finding.eventIds.map((id) => eventsById.get(id)).filter((e): e is InboxFeedEvent => !!e);
  if (refs.length === 0) return null;

  if (refs.length === 1) {
    const ref = refs[0];
    const content = (
      <>
        <span className="text-[15px] leading-snug text-foreground">{finding.statement}</span>
        {ref.sourceUrl ? (
          <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted transition-colors group-hover:text-accent-strong" aria-hidden />
        ) : (
          <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted transition-colors group-hover:text-accent-strong" aria-hidden />
        )}
      </>
    );
    const rowClass =
      "group -mx-2 flex items-start justify-between gap-3 rounded-md px-2 py-3 text-left hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
    return ref.sourceUrl ? (
      <a href={ref.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${finding.statement} — open source`} className={rowClass}>
        {content}
      </a>
    ) : (
      <button type="button" onClick={() => onShowEvent(ref.id)} className={cn("w-full", rowClass)}>
        {content}
      </button>
    );
  }

  return (
    <div className="py-1">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="group -mx-2 flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <span className="text-[15px] leading-snug text-foreground">{finding.statement}</span>
        <span className="mt-1 flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted">
          {refs.length} sources
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
        </span>
      </button>
      {expanded && (
        <ul className="mb-2 ml-2 mt-1 flex flex-col gap-1.5 border-l border-border pl-3">
          {refs.map((ref) => (
            <li key={ref.id} className="flex flex-wrap items-center gap-x-2 text-xs">
              <button
                type="button"
                onClick={() => onShowEvent(ref.id)}
                className="rounded font-medium text-accent-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {ref.title}
              </button>
              {ref.sourceUrl && (
                <a
                  href={ref.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-accent-strong hover:underline"
                >
                  {ref.sourceName ?? "Source"} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WeeklyReview({
  id,
  eventsById,
  onCollapse,
  onShowEvent,
}: {
  id: string;
  eventsById: Map<string, InboxFeedEvent>;
  onCollapse: () => void;
  onShowEvent: (eventId: string) => void;
}) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; sections: ReviewSection[] } | { kind: "empty" } | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiPost<DigestResponse<{ sections: ReviewSection[] }>>("/api/inbox/review")
      .then((res) => {
        if (cancelled) return;
        setState(res.status === "ready" ? { kind: "ready", sections: res.digest.sections } : { kind: "empty" });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof ApiError ? err.message : "Something went wrong." });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <section id={id} aria-label="Weekly review" className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Full review</p>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Close full review"
          className="rounded-full p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {state.kind === "loading" && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" role="status">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Writing your weekly review from this week&apos;s updates…
          </p>
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
        </div>
      )}
      {state.kind === "error" && (
        <Alert variant="danger" className="flex flex-wrap items-center justify-between gap-3">
          <span>Couldn&apos;t write the weekly review. {state.message}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setState({ kind: "loading" });
              setAttempt((a) => a + 1);
            }}
          >
            Try again
          </Button>
        </Alert>
      )}
      {state.kind === "empty" && (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
          Nothing changed this week, so there&apos;s nothing to review.
        </p>
      )}
      {state.kind === "ready" && (
        <div className="flex flex-col gap-3">
          {state.sections.map((section, i) => {
            const refs = section.eventIds.map((eid) => eventsById.get(eid)).filter((e): e is InboxFeedEvent => !!e);
            return (
              <article key={i} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-foreground">{section.heading}</h3>
                  {refs.length > 0 && (
                    <Badge variant="neutral" className="shrink-0 whitespace-nowrap">
                      {refs.length} {refs.length === 1 ? "update" : "updates"}
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{section.body}</p>
                {refs.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {refs.map((ref) =>
                      ref.sourceUrl ? (
                        <a
                          key={ref.id}
                          href={ref.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-foreground transition-colors hover:border-accent-strong hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        >
                          {ref.sourceName ?? ref.title} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <button
                          key={ref.id}
                          type="button"
                          onClick={() => onShowEvent(ref.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-foreground transition-colors hover:border-accent-strong hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        >
                          {ref.title}
                        </button>
                      )
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Low-priority, collapsed by default — see lib/inbox/source-issues.ts. Raw
 * fetch/parser errors are real but never belong next to the week's findings. */
function SourceIssues({ issues }: { issues: InboxSourceIssue[] }) {
  const [open, setOpen] = useState(false);
  if (issues.length === 0) return null;

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded text-xs text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        Research source issues · {issues.length}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-2.5 border-t border-border pt-2.5">
          {issues.map((issue) => (
            <li key={issue.id} className="text-xs">
              <Link href={`/kb/${issue.vault.id}/sources`} className="font-medium text-foreground hover:underline">
                {issue.name}
              </Link>{" "}
              <span className="text-muted">· {issue.vault.name}</span>
              <p className="mt-0.5 break-all text-muted">{issue.lastError}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Feed({
  events,
  openIds,
  onToggle,
}: {
  events: InboxFeedEvent[];
  openIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const timeZone = useTimeZone();
  const groups: { label: string; items: InboxFeedEvent[] }[] = [];
  for (const event of events) {
    const label = dayLabel(event.occurredAt, timeZone);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(event);
    else groups.push({ label, items: [event] });
  }

  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-muted">{group.label}</h3>
          <ul className="border-t border-border">
            {group.items.map((event) => (
              <FeedItem
                key={event.id}
                event={event}
                timeZone={timeZone}
                open={openIds.has(event.id)}
                onToggle={() => onToggle(event.id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FeedItem({
  event,
  timeZone,
  open,
  onToggle,
}: {
  event: InboxFeedEvent;
  timeZone: string;
  open: boolean;
  onToggle: () => void;
}) {
  const detailsId = useId();
  const noteHref = event.note ? `/kb/${event.vault.id}/library#entry-${event.note.id}` : `/kb/${event.vault.id}`;

  return (
    <li id={`event-${event.id}`} className="scroll-mt-6 border-b border-border py-3.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="rounded bg-accent-soft px-1.5 py-0.5 font-medium text-accent-strong">{CATEGORY_LABEL[event.category]}</span>
        <StatusLabel event={event} />
        <span className="text-muted">{formatTime(event.occurredAt, timeZone)}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium text-foreground">{event.title}</p>
      <p className="mt-0.5 text-xs text-muted">
        <Link href={`/kb/${event.vault.id}`} className="text-accent-strong hover:underline">
          {event.vault.name}
        </Link>
        {event.note && (
          <>
            {" › "}
            <Link href={noteHref} className="text-accent-strong hover:underline">
              {event.note.title}
            </Link>
          </>
        )}
      </p>
      <p className={cn("mt-1 text-sm text-foreground", !open && "line-clamp-2")}>{event.description}</p>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {ORIGIN_LABEL[event.origin] ?? event.origin}
          {event.sourceName && <> · {event.sourceName}</>}
          {event.sourceUrl && (
            <>
              {" · "}
              <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent-strong hover:underline">
                View source <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={detailsId}
          className="inline-flex items-center gap-1 rounded font-medium text-accent-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {open ? "Hide details" : "Details"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && <FeedItemDetails id={detailsId} event={event} noteHref={noteHref} />}
    </li>
  );
}

function StatusLabel({ event }: { event: InboxFeedEvent }) {
  if (event.status === "PROPOSED") {
    return (
      <span className="rounded border border-accent-strong/40 px-1.5 py-0.5 font-medium text-accent-strong">
        Proposed · awaiting your review
      </span>
    );
  }
  if (event.status === "DECLINED") return <span className="text-muted">Declined · not applied</span>;
  return <span className="text-muted">{event.category === "CORRECTION" ? "Applied" : "Added"}</span>;
}

function FeedItemDetails({ id, event, noteHref }: { id: string; event: InboxFeedEvent; noteHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(action: "approve" | "reject") {
    if (!event.proposalId) return;
    setBusy(action);
    setError(null);
    try {
      await apiPost(`/api/proposals/${event.proposalId}/${action}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div id={id} className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-card p-3.5 text-sm">
      {event.category === "CORRECTION" && (event.beforeContent || event.afterContent) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextBlock label={event.status === "APPLIED" ? "Before" : "Current note"} text={event.beforeContent} />
          <TextBlock label={event.status === "APPLIED" ? "After" : "Proposed update"} text={event.afterContent} />
        </div>
      )}
      {event.evidence && (
        <TextBlock label={event.category === "CORRECTION" ? "Supporting evidence" : "Why it was added"} text={event.evidence} />
      )}
      {event.status === "PROPOSED" && event.proposalId && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-xs text-muted">This change hasn&apos;t been applied. Approve it to update the note.</p>
          <Button size="sm" onClick={() => review("approve")} disabled={!!busy}>
            {busy === "approve" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Approve
          </Button>
          <Button size="sm" variant="secondary" onClick={() => review("reject")} disabled={!!busy}>
            {busy === "reject" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Decline
          </Button>
        </div>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
      <Link href={noteHref} className="w-fit text-xs font-medium text-accent-strong hover:underline">
        {event.note ? "Open note →" : "Open knowledge vault →"}
      </Link>
    </div>
  );
}

function TextBlock({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="whitespace-pre-line text-sm text-foreground">{text}</p>
    </div>
  );
}

function formatRange(startIso: string, endIso: string) {
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt.format(new Date(startIso))} – ${fmt.format(new Date(endIso))}`;
}

function dayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dayLabel(iso: string, timeZone: string) {
  const date = new Date(iso);
  const now = new Date();
  const key = dayKey(date, timeZone);
  if (key === dayKey(now, timeZone)) return "Today";
  if (key === dayKey(new Date(now.getTime() - 86_400_000), timeZone)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone }).format(date);
}

function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}
