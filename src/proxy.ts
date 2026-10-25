import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, getAuthConfig, safeNextPath, verifySessionToken } from "@/lib/auth/session";

// Paths reachable without a session: the sign-in page and the endpoint its form posts to.
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

/**
 * Authentication gate for every page and API route (see lib/auth/session.ts).
 * Unauthenticated page requests are redirected to /login; API requests get a
 * 401 in the app's usual `{ ok: false, error }` envelope.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const config = getAuthConfig();

  if (config.status === "disabled-dev") return NextResponse.next();
  if (config.status === "misconfigured") {
    return NextResponse.json(
      { ok: false, error: { message: "Sign-in is not configured on this deployment (APP_PASSWORD / AUTH_SECRET)." } },
      { status: 503 }
    );
  }

  const signedIn = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, config.secret);

  if (PUBLIC_PATHS.has(pathname)) {
    // Already signed in: skip the sign-in page.
    if (signedIn && pathname === "/login") {
      return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url));
    }
    return NextResponse.next();
  }
  if (signedIn) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: { message: "Not signed in." } }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's static assets and the favicon/public SVGs, which hold no data.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|[^/]+\\.svg$).*)"],
};
