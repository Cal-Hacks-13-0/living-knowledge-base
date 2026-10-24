import crypto from "node:crypto";

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "ref",
  "source",
];

/** Canonicalizes a URL: lowercases host, strips fragment/tracking params, sorts remaining params. */
export function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  const params = Array.from(url.searchParams.entries()).filter(
    ([key]) => !TRACKING_PARAMS.includes(key.toLowerCase())
  );
  params.sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, value] of params) {
    url.searchParams.append(key, value);
  }
  return url.toString();
}

/** Deterministic content hash used for exact-deduplication of document bodies. */
export function hashContent(content: string): string {
  const normalized = content.trim().replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export interface NormalizedDocument {
  externalId: string | null;
  url: string;
  title: string;
  content: string;
  contentHash: string;
  publishedAt: Date | null;
}

export function buildNormalizedDocument(input: {
  externalId?: string | null;
  url: string;
  title: string;
  content: string;
  publishedAt?: string | Date | null;
}): NormalizedDocument {
  const url = normalizeUrl(input.url);
  const content = input.content.trim();
  let publishedAt: Date | null = null;
  if (input.publishedAt) {
    const d = new Date(input.publishedAt);
    if (!Number.isNaN(d.getTime())) publishedAt = d;
  }
  return {
    externalId: input.externalId ?? null,
    url,
    title: input.title.trim().slice(0, 500) || "(untitled)",
    content,
    contentHash: hashContent(content || input.title),
    publishedAt,
  };
}
