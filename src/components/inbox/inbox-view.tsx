"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, ExternalLink, Inbox as InboxIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
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

interface WeekStats {
  updates: number;
  vaults: number;
}

type DigestResponse<T> = { status: "empty"; stats: WeekStats } | { status: "ready"; stats: WeekStats; digest: T; cached: boolean };

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
}: {
  events: InboxFeedEvent[];
  range: { start: string; end: string };
  stats: WeekStats;
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

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Inbox</h1>
        <p className="mt-1 text-sm text-muted">Your knowledge keeps moving. Here&apos;s what changed.</p>
      </div>

      <OverviewCard
        range={range}
        stats={stats}
        reviewOpen={reviewOpen}
        reviewId={reviewId}
        onToggleReview={() => setReviewOpen((o) => !o)}
      />

      {reviewOpen && (
        <WeeklyReview
          id={reviewId}
          eventsById={byId}
          onCollapse={() => setReviewOpen(false)}
          onShowEvent={(id) => {
            toggleEvent(id, true);
            document.getElementById(`event-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      )}

      <section className="mt-10" aria-labelledby="all-updates">
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
    </div>
  );
}

function OverviewCard({
  range,
  stats,
  reviewOpen,
  reviewId,
  onToggleReview,
}: {
  range: { start: string; end: string };
  stats: WeekStats;
  reviewOpen: boolean;
  reviewId: string;
  onToggleReview: () => void;
}) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; text: string } | { kind: "empty" } | { kind: "unavailable" }
  >(stats.updates === 0 ? { kind: "empty" } : { kind: "loading" });

  useEffect(() => {
    if (stats.updates === 0) return;
    let cancelled = false;
    apiGet<DigestResponse<{ overview: string }>>("/api/inbox/overview")
      .then((res) => {
        if (cancelled) return;
        setState(res.status === "ready" ? { kind: "ready", text: res.digest.overview } : { kind: "empty" });
      })
      .catch(() => !cancelled && setState({ kind: "unavailable" }));
    return () => {
      cancelled = true;
    };
  }, [stats.updates]);

  return (
    <section
      aria-labelledby="week-heading"
      className="rounded-xl border border-border bg-accent-soft px-5 py-4 text-foreground"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-strong">
        Your week, distilled
        <span className="font-medium normal-case tracking-normal text-muted">{formatRange(range.start, range.end)}</span>
      </p>
      <h2 id="week-heading" className="mt-1.5 text-lg font-semibold">
        This week, in brief.
      </h2>
      <div className="mt-1.5 text-sm leading-relaxed" aria-live="polite">
        {state.kind === "loading" && (
          <div className="flex flex-col gap-1.5 py-0.5" aria-label="Summarizing this week">
            <Skeleton className="h-3.5 w-full bg-border" />
            <Skeleton className="h-3.5 w-2/3 bg-border" />
          </div>
        )}
        {state.kind === "ready" && <p>{state.text}</p>}
        {state.kind === "empty" && (
          <p className="text-muted">
            Nothing changed in your knowledge vaults this week. New discoveries and changes will show up here automatically.
          </p>
        )}
        {state.kind === "unavailable" && (
          <p className="text-muted">
            {stats.updates} {stats.updates === 1 ? "update was" : "updates were"} recorded this week. The AI summary
            isn&apos;t available right now, but every update is listed below.
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-xs text-muted">
          {stats.updates} {stats.updates === 1 ? "update" : "updates"} · {stats.vaults}{" "}
          {stats.vaults === 1 ? "knowledge vault" : "knowledge vaults"}
        </p>
        {stats.updates > 0 && (
          <Button size="sm" onClick={onToggleReview} aria-expanded={reviewOpen} aria-controls={reviewOpen ? reviewId : undefined}>
            {reviewOpen ? "Hide weekly review" : "Read weekly review"}
            <ArrowRight className={cn("h-3.5 w-3.5 transition-transform", reviewOpen && "-rotate-90")} />
          </Button>
        )}
      </div>
    </section>
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
    <section id={id} aria-label="Weekly review" className="mt-4 rounded-xl border border-border bg-card px-5 py-5">
      {state.kind === "loading" && (
        <div className="flex flex-col gap-3" role="status">
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
      {state.kind === "empty" && <p className="text-sm text-muted">Nothing changed this week, so there&apos;s nothing to review.</p>}
      {state.kind === "ready" && (
        <div className="flex flex-col gap-6">
          {state.sections.map((section, i) => {
            const refs = section.eventIds.map((eid) => eventsById.get(eid)).filter((e): e is InboxFeedEvent => !!e);
            return (
              <article key={i}>
                <h3 className="text-base font-semibold text-foreground">{section.heading}</h3>
                <p className="mt-1 text-sm leading-relaxed text-foreground">{section.body}</p>
                {refs.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
                    {refs.map((ref) => (
                      <li key={ref.id} className="flex flex-wrap items-center gap-x-2">
                        <button
                          type="button"
                          onClick={() => onShowEvent(ref.id)}
                          className="rounded text-left font-medium text-accent-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
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
              </article>
            );
          })}
        </div>
      )}
      <div className="mt-5 flex justify-end border-t border-border pt-3">
        <Button size="sm" variant="ghost" onClick={onCollapse}>
          Collapse review
        </Button>
      </div>
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
