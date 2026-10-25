import { ok, handleApiError } from "@/lib/api/response";
import { getWeeklyFindings } from "@/lib/inbox/digest";

// Vercel function time limit in seconds (one short structured AI call when the cache is stale).
export const maxDuration = 60;

/** The 2-3 standout findings shown at the top of the Inbox (cached until this week's events change). */
export async function GET() {
  try {
    return ok(await getWeeklyFindings());
  } catch (err) {
    return handleApiError(err);
  }
}
