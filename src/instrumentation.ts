/**
 * Next.js instrumentation hook — runs once when the server process starts
 * (Node.js runtime only). We use it to boot the in-process research
 * scheduler. See src/lib/jobs/scheduler.ts for the important caveat: this
 * only runs while the server process is alive.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initScheduler } = await import("@/lib/jobs/scheduler");
    await initScheduler();
  }
}
