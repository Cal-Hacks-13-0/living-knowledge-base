import { describe, it, expect } from "vitest";
import {
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  getAuthConfig,
  passwordMatches,
  safeNextPath,
  verifySessionToken,
} from "@/lib/auth/session";

const SECRET = "x".repeat(40);

describe("session tokens", () => {
  it("accepts a fresh token signed with the same secret", async () => {
    expect(await verifySessionToken(await createSessionToken(SECRET), SECRET)).toBe(true);
  });

  it("rejects missing, tampered, wrongly-signed, and expired tokens", async () => {
    const token = await createSessionToken(SECRET, 1_000);
    expect(await verifySessionToken(undefined, SECRET)).toBe(false);
    expect(await verifySessionToken("garbage", SECRET)).toBe(false);
    const [v, exp, sig] = token.split(".");
    expect(await verifySessionToken(`${v}.${Number(exp) + 1}.${sig}`, SECRET, 2_000)).toBe(false);
    expect(await verifySessionToken(token, "y".repeat(40), 2_000)).toBe(false);
    expect(await verifySessionToken(token, SECRET, 1_000 + SESSION_MAX_AGE_SECONDS * 1000 + 1)).toBe(false);
  });
});

describe("passwordMatches", () => {
  it("only accepts the exact configured password", async () => {
    const config = { password: "correct horse", secret: SECRET };
    expect(await passwordMatches("correct horse", config)).toBe(true);
    expect(await passwordMatches("correct hors", config)).toBe(false);
    expect(await passwordMatches("", config)).toBe(false);
  });
});

describe("getAuthConfig", () => {
  it("is enabled only with a password and a long enough secret", () => {
    expect(getAuthConfig({ APP_PASSWORD: "p", AUTH_SECRET: SECRET, NODE_ENV: "production" }).status).toBe("enabled");
    expect(getAuthConfig({ APP_PASSWORD: "p", AUTH_SECRET: "short", NODE_ENV: "production" }).status).toBe("misconfigured");
  });

  it("fails closed in production and open only in development", () => {
    expect(getAuthConfig({ NODE_ENV: "production" }).status).toBe("misconfigured");
    expect(getAuthConfig({ NODE_ENV: "development" }).status).toBe("disabled-dev");
  });
});

describe("safeNextPath", () => {
  it("allows same-origin paths and rejects everything else", () => {
    expect(safeNextPath("/kb/abc?x=1")).toBe("/kb/abc?x=1");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
