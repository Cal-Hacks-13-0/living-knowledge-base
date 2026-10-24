import { describe, it, expect } from "vitest";
import { normalizeUrl, hashContent, buildNormalizedDocument } from "@/lib/research/normalizer";

describe("normalizeUrl", () => {
  it("strips tracking params and lowercases the host", () => {
    const a = normalizeUrl("https://Example.com/Post?utm_source=newsletter&id=1");
    const b = normalizeUrl("https://example.com/Post?id=1");
    expect(a).toBe(b);
  });

  it("removes a trailing slash and the fragment", () => {
    expect(normalizeUrl("https://example.com/post/#section")).toBe("https://example.com/post");
  });

  it("sorts query params so param order doesn't cause false distinctness", () => {
    const a = normalizeUrl("https://example.com/post?b=2&a=1");
    const b = normalizeUrl("https://example.com/post?a=1&b=2");
    expect(a).toBe(b);
  });

  it("treats different real paths as different URLs", () => {
    expect(normalizeUrl("https://example.com/post/1")).not.toBe(normalizeUrl("https://example.com/post/2"));
  });
});

describe("hashContent", () => {
  it("is stable across insignificant whitespace differences", () => {
    expect(hashContent("Hello   world")).toBe(hashContent("Hello world"));
    expect(hashContent("Hello\nworld")).toBe(hashContent("Hello world"));
  });

  it("differs for genuinely different content", () => {
    expect(hashContent("Hello world")).not.toBe(hashContent("Goodbye world"));
  });
});

describe("buildNormalizedDocument", () => {
  it("falls back to a placeholder title and parses a valid publishedAt", () => {
    const doc = buildNormalizedDocument({
      url: "https://example.com/a",
      title: "  ",
      content: "some content",
      publishedAt: "2024-01-15T00:00:00Z",
    });
    expect(doc.title).toBe("(untitled)");
    expect(doc.publishedAt).toEqual(new Date("2024-01-15T00:00:00Z"));
  });

  it("sets publishedAt to null for unparseable dates", () => {
    const doc = buildNormalizedDocument({
      url: "https://example.com/a",
      title: "Title",
      content: "content",
      publishedAt: "not-a-date",
    });
    expect(doc.publishedAt).toBeNull();
  });
});
