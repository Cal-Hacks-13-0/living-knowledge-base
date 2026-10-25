import { ok, handleApiError } from "@/lib/api/response";
import { getWeeklyOverview } from "@/lib/inbox/digest";

// Vercel function time limit in seconds (one short structured AI call when the cache is stale).
export const maxDuration = 60;

/** This week's AI overview for the Inbox card (cached until this week's events change). */
export async function GET() {
  try {
    return ok(await getWeeklyOverview());
  } catch (err) {
    return handleApiError(err);
  }
}
