import { describe, it, expect, vi, beforeEach } from "vitest";

const SAMPLE_FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example Feed</title>
  <item>
    <title>First post</title>
    <link>https://example.com/posts/1</link>
    <guid>https://example.com/posts/1</guid>
    <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    <description>Content of the first post.</description>
  </item>
  <item>
    <title>Second post</title>
    <link>https://example.com/posts/2</link>
    <guid>https://example.com/posts/2</guid>
    <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
    <description>Content of the second post.</description>
  </item>
</channel></rss>`;

vi.mock("@/lib/research/http", () => ({
  safeFetch: vi.fn(),
  withRetry: (fn: () => Promise<unknown>) => fn(),
  isAllowedByRobots: vi.fn().mockResolvedValue(true),
}));

import { safeFetch, isAllowedByRobots } from "@/lib/research/http";
import { fetchRssSource } from "@/lib/research/rss-fetcher";

describe("fetchRssSource", () => {
  beforeEach(() => {
    vi.mocked(safeFetch).mockReset();
    vi.mocked(isAllowedByRobots).mockResolvedValue(true);
  });

  it("parses feed items into normalized documents (deterministic fixture, no live network)", async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      status: 200,
      finalUrl: "https://example.com/feed.xml",
      headers: new Headers({ etag: '"abc123"' }),
      text: SAMPLE_FEED,
      notModified: false,
    });

    const result = await fetchRssSource("https://example.com/feed.xml");
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0].url).toBe("https://example.com/posts/1");
    expect(result.documents[0].title).toBe("First post");
    expect(result.etag).toBe('"abc123"');
  });

  it("returns no documents on a 304 Not Modified response", async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      status: 304,
      finalUrl: "https://example.com/feed.xml",
      headers: new Headers(),
      text: "",
      notModified: true,
    });

    const result = await fetchRssSource("https://example.com/feed.xml", { etag: '"abc123"' });
    expect(result.notModified).toBe(true);
    expect(result.documents).toHaveLength(0);
  });

  it("refuses to fetch when robots.txt disallows the URL", async () => {
    vi.mocked(isAllowedByRobots).mockResolvedValue(false);
    await expect(fetchRssSource("https://example.com/private-feed.xml")).rejects.toThrow(/robots/i);
  });

  it("propagates fetch failures instead of silently returning stale/fake success", async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error("network unreachable"));
    await expect(fetchRssSource("https://example.com/feed.xml")).rejects.toThrow("network unreachable");
  });
});
