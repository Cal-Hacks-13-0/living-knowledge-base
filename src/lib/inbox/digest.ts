import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { generateStructured } from "@/lib/ai/client";
import { currentWorkspaceId } from "@/lib/workspace";
import { listInboxEvents, type InboxEventWithRefs } from "./events";

/**
 * AI write-ups of the Inbox for "this week" (the last 7 days, in UTC days):
 * a one-or-two-sentence overview, and an on-demand detailed review. Both are
 * generated only from recorded Inbox events and cached in InboxDigest under a
 * fingerprint of those events, so they're regenerated exactly when an event in
 * the range is added or changes status.
 */

export const WEEK_DAYS = 7;

export interface InboxRange {
  start: Date;
  end: Date;
  key: string;
}

export function currentWeekRange(now = new Date()): InboxRange {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (WEEK_DAYS - 1)));
  return { start, end: now, key: `${isoDay(start)}_${isoDay(now)}` };
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function eventsFingerprint(events: Pick<InboxEventWithRefs, "id" | "status" | "updatedAt">[]): string {
  const parts = events.map((e) => `${e.id}:${e.status}:${e.updatedAt.toISOString()}`).sort();
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export interface WeekStats {
  updates: number;
  vaults: number;
}

export function weekStats(events: Pick<InboxEventWithRefs, "knowledgeBaseId">[]): WeekStats {
  return { updates: events.length, vaults: new Set(events.map((e) => e.knowledgeBaseId)).size };
}

const STATUS_WORD = { APPLIED: "applied", PROPOSED: "proposed — awaiting the user's approval, NOT applied", DECLINED: "declined by the user — NOT applied" } as const;

function eventsForPrompt(events: InboxEventWithRefs[]) {
  return events.map((e) => ({
    id: e.id,
    category: e.category,
    status: STATUS_WORD[e.status],
    vault: e.knowledgeBase.name,
    note: e.knowledgeEntry?.title ?? null,
    title: e.title,
    description: e.description.slice(0, 400),
    source: e.sourceName,
    when: e.occurredAt.toISOString(),
  }));
}

const RULES = `Rules:
- Use ONLY the events provided. Never invent discoveries, sources, corrections, counts, or activity.
- A "proposed" change has NOT been applied; describe it as proposed or awaiting review. A "declined" change was not applied.
- Be specific (name the vault and the topic) but concise. Plain prose, no markdown headings or bullet symbols.
- Write to the user as "you".
- Call the user's collection a "knowledge vault" (never "knowledge base").`;

const OverviewSchema = z.object({
  overview: z.string().min(1).max(420).describe("One or two sentences on the most meaningful changes this week."),
});

const ReviewSchema = z.object({
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(80).describe("Short theme for a group of related changes."),
        body: z.string().min(1).max(900).describe("What changed and why it matters, in 2-4 sentences."),
        eventIds: z.array(z.string()).describe("IDs of the events this section is based on."),
      })
    )
    .min(1)
    .max(5),
});

export interface OverviewDigest {
  overview: string;
}

export interface ReviewSection {
  heading: string;
  body: string;
  eventIds: string[];
}

export interface ReviewDigest {
  sections: ReviewSection[];
}

async function generateOverview(events: InboxEventWithRefs[]): Promise<OverviewDigest> {
  const result = await generateStructured({
    system: `You write the one-paragraph weekly overview at the top of Axion's Inbox, a feed of changes to the user's knowledge vaults.\n${RULES}\n- One or two sentences, at most about 60 words. Lead with the most meaningful change.`,
    prompt: `This week's recorded Inbox events (JSON):\n${JSON.stringify(eventsForPrompt(events))}\n\nCall emit_result with the overview.`,
    schema: OverviewSchema,
    maxTokens: 400,
  });
  return { overview: result.overview.trim() };
}

async function generateReview(events: InboxEventWithRefs[]): Promise<ReviewDigest> {
  const result = await generateStructured({
    system: `You write Axion's weekly review: a short reading section explaining the week's important changes to the user's knowledge vaults and why they matter.\n${RULES}\n- Group related events into 1-5 themed sections instead of repeating every event; minor events may be folded together.\n- Every section must cite the IDs of the events it draws on in eventIds.`,
    prompt: `This week's recorded Inbox events (JSON):\n${JSON.stringify(eventsForPrompt(events))}\n\nCall emit_result with the review.`,
    schema: ReviewSchema,
    maxTokens: 1500,
  });
  const known = new Set(events.map((e) => e.id));
  return {
    sections: result.sections.map((s) => ({
      heading: s.heading.trim(),
      body: s.body.trim(),
      // Keep only references to events that actually exist in this range.
      eventIds: [...new Set(s.eventIds.filter((id) => known.has(id)))],
    })),
  };
}

export type DigestResult<T> =
  | { status: "empty"; range: InboxRange; stats: WeekStats }
  | { status: "ready"; range: InboxRange; stats: WeekStats; digest: T; cached: boolean };

async function getDigest<T>(
  kind: "overview" | "review",
  generate: (events: InboxEventWithRefs[]) => Promise<T>,
  now?: Date
): Promise<DigestResult<T>> {
  const range = currentWeekRange(now);
  const events = await listInboxEvents({ since: range.start });
  const stats = weekStats(events);
  if (events.length === 0) return { status: "empty", range, stats };

  const workspaceId = currentWorkspaceId();
  const fingerprint = eventsFingerprint(events);
  const where = { workspaceId_kind_rangeKey: { workspaceId, kind, rangeKey: range.key } };
  const cached = await prisma.inboxDigest.findUnique({ where });
  if (cached && cached.fingerprint === fingerprint) {
    return { status: "ready", range, stats, digest: JSON.parse(cached.content) as T, cached: true };
  }

  // Concurrent requests for the same stale digest (two tabs, a double-mounted
  // effect) share one AI call instead of each generating and overwriting.
  const flightKey = `${workspaceId}:${kind}:${range.key}:${fingerprint}`;
  let flight = inFlight.get(flightKey) as Promise<T> | undefined;
  if (!flight) {
    flight = (async () => {
      const digest = await generate(events);
      const content = JSON.stringify(digest);
      await prisma.inboxDigest.upsert({
        where,
        update: { fingerprint, content, createdAt: new Date() },
        create: { workspaceId, kind, rangeKey: range.key, fingerprint, content },
      });
      return digest;
    })().finally(() => inFlight.delete(flightKey));
    inFlight.set(flightKey, flight);
  }
  return { status: "ready", range, stats, digest: await flight, cached: false };
}

const inFlight = new Map<string, Promise<unknown>>();

export function getWeeklyOverview(now?: Date) {
  return getDigest<OverviewDigest>("overview", generateOverview, now);
}

export function getWeeklyReview(now?: Date) {
  return getDigest<ReviewDigest>("review", generateReview, now);
}
