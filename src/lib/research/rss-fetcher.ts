import Parser from "rss-parser";
import { safeFetch, withRetry, isAllowedByRobots } from "./http";
import { buildNormalizedDocument, type NormalizedDocument } from "./normalizer";

export interface FetchResult {
  documents: NormalizedDocument[];
  notModified: boolean;
  etag: string | null;
  lastModified: string | null;
}

const parser = new Parser({ timeout: 10_000 });

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
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      etag: conditional.etag,
      lastModified: conditional.lastModified,
    })
  );

  if (res.notModified) {
    return { documents: [], notModified: true, etag: conditional.etag ?? null, lastModified: conditional.lastModified ?? null };
  }

  const feed = await parser.parseString(res.text);
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
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
  };
}
