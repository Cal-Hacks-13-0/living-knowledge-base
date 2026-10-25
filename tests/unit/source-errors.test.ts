import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { explainSourceError } from "@/lib/research/source-errors";
import { prisma } from "@/lib/db/prisma";
import { resetDb, createTestKnowledgeBase } from "../helpers/db";

describe("explainSourceError — real stored errors", () => {
  const cases: Array<[string, string, string, boolean]> = [
    // raw lastError (as our fetchers write it), kind, stage, temporary
    ["www.mountainproject.com returned HTTP 404", "not_found", "access", false],
    ["www.rei.com returned HTTP 403", "access_denied", "access", false],
    ["example.com returned HTTP 401", "sign_in_required", "access", false],
    ["api.example.com returned HTTP 429", "rate_limited", "access", true],
    ["example.com returned HTTP 503", "server_error", "access", true],
    ["example.com did not respond within 10s (timed out)", "timeout", "access", true],
    ["This operation was aborted", "timeout", "access", true],
    ["Couldn't connect to nope.invalid (ENOTFOUND): fetch failed", "address_not_found", "access", false],
    ["Couldn't connect to example.com (ECONNREFUSED): fetch failed", "connection_failed", "access", true],
    ["fetch failed", "connection_failed", "access", true],
    ["Fetching disallowed by robots.txt: https://www.reddit.com/r/climbing.rss", "robots_disallowed", "access", false],
    ['Refusing to fetch "10.0.0.1": resolves to a private/reserved IP address.', "private_address", "access", false],
    ["Unsupported content-type: application/pdf", "unsupported_content", "content", false],
    ["Response exceeded 3145728 bytes", "too_large", "content", false],
    ["Too many redirects", "redirect_problem", "access", false],
    ["Attribute without value\nLine: 17\nColumn: 22\nChar: >", "not_a_feed", "content", false],
    ["example.com loaded, but the page had no readable text", "empty_content", "content", false],
    ["GitHub API returned 404 for acme/widgets", "not_found", "access", false],
    ['AI processing failed: 400 {"type":"error","error":{"type":"invalid_request_error"}}', "processing_failed", "processing", true],
    ["Something nobody anticipated", "unknown", "access", true],
  ];
  for (const [raw, kind, stage, temporary] of cases) {
    it(`${kind}: ${raw.slice(0, 50)}`, () => {
      const e = explainSourceError(raw);
      expect(e.kind).toBe(kind);
      expect(e.stage).toBe(stage);
      expect(e.temporary).toBe(temporary);
      expect(e.title.length).toBeGreaterThan(3);
      expect(e.message).not.toMatch(/HTTP|robots\.txt:|ENOTFOUND|content-type|fetch failed/); // no jargon in the main text
      expect(e.technical).toContain(raw.split("\n")[0].slice(0, 30)); // raw stays available, secondary
    });
  }

  it("doesn't claim more than the evidence shows", () => {
    expect(explainSourceError("x.com returned HTTP 403").message).not.toMatch(/subscri|member|sign in|paywall/i);
    expect(explainSourceError("x.com returned HTTP 404").message).not.toMatch(/fake|never existed|doesn't exist/i);
    expect(explainSourceError("x.com did not respond within 10s (timed out)").message).not.toMatch(/offline|down|permanent/i);
    // Feed discovery is only mentioned when the error shows it was attempted.
    expect(explainSourceError("Attribute without value").message).not.toMatch(/couldn't find a feed linked/);
    expect(explainSourceError("Attribute without value — this URL isn't a feed and none was discoverable on the page.").message).toMatch(
      /couldn't find a feed linked/
    );
    // A processing failure never reads as the source being inaccessible.
    expect(explainSourceError("AI processing failed: overloaded").message).not.toMatch(/couldn't (access|connect|reach)/i);
  });

  it("keeps an honest, specific line for unmapped status codes", () => {
    const e = explainSourceError("x.com returned HTTP 418");
    expect(e.kind).toBe("unknown");
    expect(e.message).toMatch(/code 418/);
    expect(e.httpStatus).toBe(418);
  });

  it("redacts credential-like values and caps the length of technical details", () => {
    const e = explainSourceError(`x.com returned HTTP 403 for https://x.com/feed?api_key=SECRET123&token=abc Bearer eyJhbGciOi.xyz ${"z".repeat(2000)}`);
    expect(e.technical).not.toMatch(/SECRET123|token=abc|eyJhbGciOi/);
    expect(e.technical.length).toBeLessThanOrEqual(600);
  });

  it("falls back safely with no stored error", () => {
    expect(explainSourceError(null).kind).toBe("unknown");
    expect(explainSourceError("").technical).toMatch(/No error details/);
  });
});

describe("safeFetch names timeouts and connection failures", () => {
  it("reports a timeout and a DNS failure distinctly", async () => {
    vi.resetModules();
    vi.doMock("@/lib/research/ssrf-guard", () => ({ assertSafeUrl: (u: string) => new URL(u), assertHostIsPublic: async () => {} }));
    const { safeFetch } = await import("@/lib/research/http");
    vi.useFakeTimers();
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_r, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))
    ) as unknown as typeof fetch;
    const pending = safeFetch("https://slow.example/feed").catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(await pending).toMatch(/slow\.example did not respond within 10s/);
    vi.useRealTimers();

    globalThis.fetch = vi.fn(async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    }) as unknown as typeof fetch;
    await expect(safeFetch("https://nope.example/")).rejects.toThrow(/Couldn't connect to nope\.example \(ENOTFOUND\)/);
    globalThis.fetch = realFetch;
    vi.doUnmock("@/lib/research/ssrf-guard");
  });
});

const fetchRssSource = vi.hoisted(() => vi.fn());
vi.mock("@/lib/research/rss-fetcher", () => ({ fetchRssSource }));

describe("source actions: check again + edit address", () => {
  beforeEach(async () => {
    await resetDb();
    fetchRssSource.mockReset();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seed() {
    const kb = await createTestKnowledgeBase();
    const source = await prisma.source.create({
      data: { knowledgeBaseId: kb.id, name: "Feed", url: "https://a.example/feed", type: "RSS", status: "ERROR", lastError: "a.example returned HTTP 404", etag: '"old"' },
    });
    return { kb, source };
  }

  it("check again: success clears the error without storing documents or touching the etag", async () => {
    const { kb, source } = await seed();
    fetchRssSource.mockResolvedValue({ documents: [{}, {}], notModified: false, etag: '"new"', lastModified: null });
    const { POST } = await import("@/app/api/knowledge-bases/[id]/sources/[sourceId]/check/route");
    const res = await POST(new NextRequest("http://x", { method: "POST" }), { params: Promise.resolve({ id: kb.id, sourceId: source.id }) });
    const body = await res.json();
    expect(body.data.reachable).toBe(true);
    expect(body.data.itemCount).toBe(2);
    expect(fetchRssSource.mock.calls[0][1]).toEqual({ etag: null, lastModified: null });
    const after = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect([after.status, after.lastError, after.etag]).toEqual(["ACTIVE", null, '"old"']);
    expect(await prisma.sourceDocument.count()).toBe(0);
  });

  it("check again: failure records the new error", async () => {
    const { kb, source } = await seed();
    fetchRssSource.mockRejectedValue(new Error("a.example returned HTTP 429"));
    const { POST } = await import("@/app/api/knowledge-bases/[id]/sources/[sourceId]/check/route");
    const res = await POST(new NextRequest("http://x", { method: "POST" }), { params: Promise.resolve({ id: kb.id, sourceId: source.id }) });
    expect((await res.json()).data.reachable).toBe(false);
    expect(explainSourceError((await prisma.source.findUniqueOrThrow({ where: { id: source.id } })).lastError).kind).toBe("rate_limited");
  });

  it("edit address: validates, rejects duplicates and other vaults, and clears stale state", async () => {
    const { kb, source } = await seed();
    const other = await createTestKnowledgeBase({ name: "Other" });
    await prisma.source.create({ data: { knowledgeBaseId: kb.id, name: "Taken", url: "https://taken.example/feed", type: "RSS" } });
    const { PATCH } = await import("@/app/api/knowledge-bases/[id]/sources/[sourceId]/route");
    const call = (vault: string, url: string) =>
      PATCH(new NextRequest("http://x", { method: "PATCH", body: JSON.stringify({ url }) }), { params: Promise.resolve({ id: vault, sourceId: source.id }) });

    expect((await call(kb.id, "ftp://a.example")).status).toBe(400);
    expect((await call(kb.id, "https://taken.example/feed")).status).toBe(409);
    expect((await call(other.id, "https://b.example/feed")).status).toBe(404);
    expect((await call(kb.id, "https://b.example/feed")).status).toBe(200);
    const after = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect([after.url, after.lastError, after.etag]).toEqual(["https://b.example/feed", null, null]);
  });
});
