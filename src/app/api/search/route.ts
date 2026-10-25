import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/api/response";
import { searchKnowledge } from "@/lib/knowledge/search";

/**
 * Global search: `{ vaults, entries }` for `?q=`. `entries` keeps the shape it
 * had before vault results were added (plus a `snippet`). See
 * lib/knowledge/search.ts for what is and isn't searched.
 */
export async function GET(req: NextRequest) {
  try {
    return ok(await searchKnowledge(req.nextUrl.searchParams.get("q") ?? ""));
  } catch (err) {
    return handleApiError(err);
  }
}
