import * as cron from "node-cron";
import { prisma } from "@/lib/db/prisma";
import { runResearch } from "@/lib/research/orchestrator";

/**
 * Persistent (for as long as the Node process is alive) in-process scheduler.
 *
 * IMPORTANT limitation, documented in README: this scheduler only runs while
 * this Next.js server process is running. If you stop `npm run dev`/`npm start`,
 * no scheduled research runs happen — there is no background daemon. For a
 * real deployment, replace this with a persistent worker process or a hosted
 * cron service (e.g. a cron-triggered serverless function, or a long-running
 * worker container) that calls the same `runResearch` orchestrator used here
 * and by the manual "Run Research Now" button.
 */

const CRON_EXPRESSIONS: Record<string, string> = {
  DAILY: "0 3 * * *", // 03:00 every day
  WEEKLY: "0 3 * * 1", // 03:00 every Monday
  MONTHLY: "0 3 1 * *", // 03:00 on the 1st of every month
};

interface SchedulerState {
  tasks: Map<string, cron.ScheduledTask>;
  initialized: boolean;
}

const globalForScheduler = globalThis as unknown as { __lkbScheduler?: SchedulerState };

function getState(): SchedulerState {
  if (!globalForScheduler.__lkbScheduler) {
    globalForScheduler.__lkbScheduler = { tasks: new Map(), initialized: false };
  }
  return globalForScheduler.__lkbScheduler;
}

async function runScheduled(knowledgeBaseId: string) {
  try {
    await runResearch(knowledgeBaseId, { trigger: "scheduled" });
  } catch (err) {
    // Overlapping-run and transient errors are recorded on the ResearchRun
    // row itself by the orchestrator; just avoid crashing the scheduler loop.
    console.error(`[scheduler] research run failed for ${knowledgeBaseId}:`, err);
  }
}

/** (Re)registers the cron job for one knowledge base based on its current frequency. */
export function syncJobForKnowledgeBase(knowledgeBaseId: string, frequency: string) {
  const state = getState();
  const existing = state.tasks.get(knowledgeBaseId);
  if (existing) {
    existing.stop();
    state.tasks.delete(knowledgeBaseId);
  }

  const expression = CRON_EXPRESSIONS[frequency];
  if (!expression) return; // MANUAL — nothing to schedule

  const task = cron.schedule(expression, () => void runScheduled(knowledgeBaseId));
  state.tasks.set(knowledgeBaseId, task);
}

export function unscheduleKnowledgeBase(knowledgeBaseId: string) {
  const state = getState();
  const existing = state.tasks.get(knowledgeBaseId);
  if (existing) {
    existing.stop();
    state.tasks.delete(knowledgeBaseId);
  }
}

/** Called once at server startup (see src/instrumentation.ts). */
export async function initScheduler() {
  const state = getState();
  if (state.initialized) return;
  state.initialized = true;

  try {
    const knowledgeBases = await prisma.knowledgeBase.findMany({
      where: { monitoringFrequency: { not: "MANUAL" } },
      select: { id: true, monitoringFrequency: true },
    });
    for (const kb of knowledgeBases) {
      syncJobForKnowledgeBase(kb.id, kb.monitoringFrequency);
    }
    console.log(`[scheduler] initialized with ${knowledgeBases.length} recurring job(s)`);
  } catch (err) {
    console.error("[scheduler] failed to initialize:", err);
  }
}

export function getScheduledKnowledgeBaseIds(): string[] {
  return Array.from(getState().tasks.keys());
}
