import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { MissingApiKeyError } from "@/lib/ai/client";
import { OverlappingRunError } from "@/lib/research/orchestrator";

export class NotFoundError extends Error {}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, details } }, { status });
}

/** Consistent error -> HTTP response mapping used by every route handler. */
export function handleApiError(err: unknown) {
  if (err instanceof ZodError) {
    return fail("Invalid request body", 400, err.issues);
  }
  if (err instanceof NotFoundError) {
    return fail(err.message || "Not found", 404);
  }
  if (err instanceof MissingApiKeyError) {
    return fail(err.message, 412); // precondition failed — AI not configured
  }
  if (err instanceof OverlappingRunError) {
    return fail(err.message, 409);
  }
  if (err instanceof Error && err.message.toLowerCase().includes("not found")) {
    return fail(err.message, 404);
  }
  console.error("API error:", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  return fail(message, 500);
}
