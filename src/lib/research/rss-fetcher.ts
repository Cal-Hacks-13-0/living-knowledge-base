import Parser from "rss-parser";
import { safeFetch, withRetry, isAllowedByRobots } from "./http";
import { buildNormalizedDocument, type NormalizedDocument } from "./normalizer";

export interface FetchResult {
  documents: NormalizedDocument[];
  notModified: boolean;
  etag: string | null;
  lastModified: string | null;
  /** Set when an RSS source's configured URL turned out to be the human-facing
   * page rather than the feed itself, and the real feed was found via the
   * page's `<link rel="alternate">` tag — the caller should persist this onto
   * the Source so future runs hit the feed directly. */
  discoveredUrl?: string | null;
}

const parser = new Parser({ timeout: 10_000 });

const LINK_TAG_RE = /<link\b[^>]*>/gi;
const REL_ALTERNATE_RE = /\brel=["']alternate["']/i;
const FEED_TYPE_RE = /\btype=["']application\/(?:rss|atom)\+xml["']/i;
const HREF_RE = /\bhref=["']([^"']+)["']/i;

/**
 * The single most common reason an "RSS" source fails to parse: it's
 * configured with the page people actually read (e.g. a blog's index page),
 * not its feed. Pages that publish a feed almost always advertise it via the
 * standard `<link rel="alternate" type="application/rss+xml|atom+xml">` tag
 * — scan for it so that misconfiguration self-heals instead of failing
 * forever with an opaque XML-parser error.
 */
function discoverFeedUrl(html: string, baseUrl: string): string | null {
  for (const tag of html.match(LINK_TAG_RE) ?? []) {
    if (!REL_ALTERNATE_RE.test(tag) || !FEED_TYPE_RE.test(tag)) continue;
    const href = tag.match(HREF_RE)?.[1];
    if (!href) continue;
    try {
      const resolved = new URL(href, baseUrl).toString();
      if (resolved !== baseUrl) return resolved;
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchRssSource(
  url: string,
  conditional: { etag?: string | null; lastModified?: string | null } = {}
): Promise<FetchResult> {
  const allowed = await isAllowedByRobots(url);
  if (!allowed) {
    throw new Error(`Fetching disallowed by robots.txt: ${url}`);
  }

  const res = await withRetry(() =>
    safeFetch(url, {
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html",
      etag: conditional.etag,
      lastModified: conditional.lastModified,
    })
  );

  if (res.notModified) {
    return { documents: [], notModified: true, etag: conditional.etag ?? null, lastModified: conditional.lastModified ?? null };
  }

  let feed: Awaited<ReturnType<typeof parser.parseString>>;
  let discoveredUrl: string | null = null;
  let feedRes = res;
  try {
    feed = await parser.parseString(res.text);
  } catch (err) {
    const discovered = discoverFeedUrl(res.text, res.finalUrl);
    if (!discovered) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${reason} — this URL isn't a feed and none was discoverable on the page. ` +
          `Check whether this source should point at its actual RSS/Atom URL (often /feed, /rss, or /atom.xml), ` +
          `or be reconfigured as an HTML source instead.`
      );
    }
    feedRes = await withRetry(() =>
      safeFetch(discovered, { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" })
    );
    feed = await parser.parseString(feedRes.text);
    discoveredUrl = discovered;
  }

  const documents = (feed.items ?? []).slice(0, 25).map((item) =>
    buildNormalizedDocument({
      externalId: item.guid ?? item.link ?? null,
      url: item.link ?? url,
      title: item.title ?? "(untitled)",
      content: item.contentSnippet ?? item.content ?? item.summary ?? item.title ?? "",
      publishedAt: item.isoDate ?? item.pubDate ?? null,
    })
  );

  return {
    documents,
    notModified: false,
    etag: feedRes.headers.get("etag"),
    lastModified: feedRes.headers.get("last-modified"),
    discoveredUrl,
  };
}
