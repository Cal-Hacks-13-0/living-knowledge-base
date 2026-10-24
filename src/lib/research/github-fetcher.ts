import { safeFetch, withRetry } from "./http";
import { buildNormalizedDocument, type NormalizedDocument } from "./normalizer";
import type { FetchResult } from "./rss-fetcher";

/** Accepts either "owner/repo" or a full https://github.com/owner/repo URL. */
export function parseGithubRepo(input: string): { owner: string; repo: string } {
  const match = input.match(/github\.com\/([^/]+)\/([^/#?]+)/) || input.match(/^([^/]+)\/([^/]+)$/);
  if (!match) throw new Error(`Could not parse GitHub repo from: ${input}`);
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

export async function fetchGithubReleases(
  repoInput: string,
  conditional: { etag?: string | null } = {}
): Promise<FetchResult> {
  const { owner, repo } = parseGithubRepo(repoInput);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`;

  const res = await withRetry(() =>
    safeFetch(apiUrl, {
      accept: "application/vnd.github+json",
      etag: conditional.etag,
      userAgent: "LivingKnowledgeBase/0.1 (+research bot)",
    })
  );

  if (res.notModified) {
    return { documents: [], notModified: true, etag: conditional.etag ?? null, lastModified: null };
  }

  if (res.status >= 400) {
    throw new Error(`GitHub API returned ${res.status} for ${owner}/${repo}`);
  }

  let releases: Array<{
    id: number;
    html_url: string;
    name: string | null;
    tag_name: string;
    body: string | null;
    published_at: string | null;
    draft: boolean;
  }>;
  try {
    releases = JSON.parse(res.text);
  } catch {
    throw new Error(`GitHub API returned non-JSON response for ${owner}/${repo}`);
  }

  const documents: NormalizedDocument[] = releases
    .filter((r) => !r.draft)
    .map((r) =>
      buildNormalizedDocument({
        externalId: String(r.id),
        url: r.html_url,
        title: r.name || r.tag_name,
        content: r.body || `Release ${r.tag_name} (no release notes provided).`,
        publishedAt: r.published_at,
      })
    );

  return { documents, notModified: false, etag: res.headers.get("etag"), lastModified: null };
}
