import { describe, it, expect } from "vitest";
import { discoverVerifiedSources, isHackerNewsSource } from "@/lib/research/known-sources";

describe("discoverVerifiedSources", () => {
  it("no longer seeds a Hacker News feed", () => {
    expect(discoverVerifiedSources("I want to learn freediving", ["Training"])).toEqual([]);
    const software = discoverVerifiedSources("full-stack development with React and Prisma", []);
    expect(software.length).toBeGreaterThan(0);
    expect(software.some(isHackerNewsSource)).toBe(false);
  });
});

describe("isHackerNewsSource", () => {
  it("matches Hacker News feeds by host or name", () => {
    expect(isHackerNewsSource({ name: "HN search", url: "https://hnrss.org/newest?q=ai" })).toBe(true);
    expect(isHackerNewsSource({ name: "Front page", url: "https://news.ycombinator.com/rss" })).toBe(true);
    expect(isHackerNewsSource({ name: "Hacker News digest", url: "https://example.com/feed" })).toBe(true);
    expect(isHackerNewsSource({ name: "React releases", url: "https://github.com/facebook/react" })).toBe(false);
  });
});
