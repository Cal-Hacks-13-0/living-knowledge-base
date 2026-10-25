/**
 * Shared-password sign-in for the whole workspace (there are no per-user
 * accounts — every signed-in visitor sees the same vaults). The session is a
 * signed, expiring token in an HttpOnly cookie, verified by src/proxy.ts on
 * every page and API request. Uses Web Crypto only, so it runs anywhere.
 *
 * Server-only configuration:
 * - APP_PASSWORD: the password people sign in with.
 * - AUTH_SECRET: random key (32+ chars) used to sign session cookies.
 * In development, if either is unset, the gate is open (local single-user use);
 * in production it fails closed.
 */

export const SESSION_COOKIE = "axion_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const TOKEN_VERSION = "v1";

export type AuthConfig =
  | { status: "enabled"; password: string; secret: string }
  | { status: "disabled-dev" }
  | { status: "misconfigured" };

export function getAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const password = env.APP_PASSWORD;
  const secret = env.AUTH_SECRET;
  if (password && secret && secret.length >= 32) return { status: "enabled", password, secret };
  return env.NODE_ENV === "production" ? { status: "misconfigured" } : { status: "disabled-dev" };
}

const encoder = new TextEncoder();

async function hmac(secret: string, data: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return crypto.subtle.sign("HMAC", key, encoder.encode(data));
}

function toBase64Url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Constant-time comparison of two equal-length byte arrays. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  return `${payload}.${toBase64Url(await hmac(secret, payload))}`;
}

export async function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  const expected = toBase64Url(await hmac(secret, `${parts[0]}.${parts[1]}`));
  return equalBytes(encoder.encode(parts[2]), encoder.encode(expected));
}

/**
 * Compares the submitted password with APP_PASSWORD without leaking its length
 * or contents through timing (both sides are HMAC'd to fixed-length digests).
 */
export async function passwordMatches(submitted: string, config: { password: string; secret: string }): Promise<boolean> {
  const [a, b] = await Promise.all([hmac(config.secret, submitted), hmac(config.secret, config.password)]);
  return equalBytes(new Uint8Array(a), new Uint8Array(b));
}

/** Only same-origin relative paths are allowed as post-sign-in destinations. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
