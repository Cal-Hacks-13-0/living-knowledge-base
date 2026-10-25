import { ok, handleApiError } from "@/lib/api/response";
import { getWeeklyReview } from "@/lib/inbox/digest";

// Vercel function time limit in seconds (one structured AI call when the cache is stale).
export const maxDuration = 120;

/** Generates (or returns the cached) detailed weekly review — only requested when the user opens it. */
export async function POST() {
  try {
    return ok(await getWeeklyReview());
  } catch (err) {
    return handleApiError(err);
  }
}
