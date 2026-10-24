import { safeFetch, withRetry, isAllowedByRobots } from "./http";
import { buildNormalizedDocument, type NormalizedDocument } from "./normalizer";
import type { FetchResult } from "./rss-fetcher";

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : "(untitled page)";
}

/**
 * Converts raw HTML to plain text. Deliberately simple (regex-based) rather
 * than executing or rendering the page — fetched content is always treated
 * as inert text, never as executable markup/script.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|p|div|li|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export async function fetchHtmlSource(
  url: string,
  conditional: { etag?: string | null; lastModified?: string | null } = {}
): Promise<FetchResult> {
  const allowed = await isAllowedByRobots(url);
  if (!allowed) {
    throw new Error(`Fetching disallowed by robots.txt: ${url}`);
  }

  const res = await withRetry(() =>
    safeFetch(url, {
      accept: "text/html,application/xhtml+xml",
      etag: conditional.etag,
      lastModified: conditional.lastModified,
    })
  );

  if (res.notModified) {
    return { documents: [], notModified: true, etag: conditional.etag ?? null, lastModified: conditional.lastModified ?? null };
  }

  const text = htmlToText(res.text).slice(0, 20000);
  const title = extractTitle(res.text);

  const documents: NormalizedDocument[] = text
    ? [buildNormalizedDocument({ externalId: null, url, title, content: text, publishedAt: null })]
    : [];

  return {
    documents,
    notModified: false,
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
  };
}
