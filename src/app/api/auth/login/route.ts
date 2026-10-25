import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  getAuthConfig,
  passwordMatches,
  safeNextPath,
} from "@/lib/auth/session";

const FAILED_ATTEMPT_DELAY_MS = 750;

/**
 * Sign-in form target (a plain HTML form post, so it works without JS). On
 * success sets the session cookie and redirects to `next`; on failure
 * redirects back to /login with an error flag.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const next = safeNextPath(form.get("next")?.toString());
  const config = getAuthConfig();

  if (config.status !== "enabled") {
    // Dev without a password configured: there's nothing to sign in to.
    return NextResponse.redirect(new URL(next, req.url), 303);
  }

  const password = form.get("password")?.toString() ?? "";
  if (!(await passwordMatches(password, config))) {
    // Slows down guessing; there's no persistent rate limit in a serverless deployment.
    await new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS));
    const login = new URL("/login", req.url);
    login.searchParams.set("error", "1");
    if (next !== "/") login.searchParams.set("next", next);
    return NextResponse.redirect(login, 303);
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(config.secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
