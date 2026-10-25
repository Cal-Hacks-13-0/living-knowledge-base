import type { BlueprintSource } from "@/lib/ai/schemas";

/**
 * Curated catalog of real, publicly reachable sources. The Blueprint Agent
 * (an LLM) is explicitly instructed to never claim a URL is "verified" since
 * it cannot browse the web to confirm a page is live — so we deterministically
 * merge in a small set of sources we know work, marked verified: true. This
 * keeps the end-to-end research loop grounded in content that actually
 * fetches instead of relying on the model to invent URLs. (A Hacker News
 * keyword feed used to be added for every goal; it was removed from the
 * wizard's source step.)
 */

const GITHUB_REPO_KEYWORDS: Array<{ keywords: string[]; repo: string; name: string }> = [
  { keywords: ["react"], repo: "facebook/react", name: "React releases (GitHub)" },
  { keywords: ["next.js", "nextjs", "next js"], repo: "vercel/next.js", name: "Next.js releases (GitHub)" },
  { keywords: ["vue"], repo: "vuejs/core", name: "Vue releases (GitHub)" },
  { keywords: ["angular"], repo: "angular/angular", name: "Angular releases (GitHub)" },
  { keywords: ["node", "node.js", "nodejs"], repo: "nodejs/node", name: "Node.js releases (GitHub)" },
  { keywords: ["typescript"], repo: "microsoft/TypeScript", name: "TypeScript releases (GitHub)" },
  { keywords: ["prisma"], repo: "prisma/prisma", name: "Prisma releases (GitHub)" },
  { keywords: ["tailwind"], repo: "tailwindlabs/tailwindcss", name: "Tailwind CSS releases (GitHub)" },
  { keywords: ["docker"], repo: "moby/moby", name: "Docker Engine releases (GitHub)" },
  { keywords: ["kubernetes", "k8s"], repo: "kubernetes/kubernetes", name: "Kubernetes releases (GitHub)" },
  { keywords: ["python"], repo: "python/cpython", name: "CPython releases (GitHub)" },
  { keywords: ["rust"], repo: "rust-lang/rust", name: "Rust releases (GitHub)" },
  { keywords: ["postgres", "postgresql"], repo: "postgres/postgres", name: "PostgreSQL releases (GitHub)" },
  { keywords: ["security", "vulnerability", "cve"], repo: "github/advisory-database", name: "GitHub Advisory Database (GitHub)" },
];

/**
 * Returns a small set of real, known-good sources relevant to the given
 * goal + category names: GitHub Releases sources when the text matches known
 * software projects. May be empty for non-software goals.
 */
export function discoverVerifiedSources(
  goalText: string,
  categoryNames: string[]
): BlueprintSource[] {
  const haystack = `${goalText} ${categoryNames.join(" ")}`.toLowerCase();
  const sources: BlueprintSource[] = [];

  const seenRepos = new Set<string>();
  for (const entry of GITHUB_REPO_KEYWORDS) {
    if (seenRepos.has(entry.repo)) continue;
    if (entry.keywords.some((kw) => haystack.includes(kw))) {
      sources.push({
        name: entry.name,
        url: `https://github.com/${entry.repo}`,
        type: "GITHUB_RELEASES",
        verified: true,
        rationale: `Official GitHub Releases feed for ${entry.repo}, matched from your goal/categories.`,
      });
      seenRepos.add(entry.repo);
      if (sources.length >= 5) break;
    }
  }

  return sources;
}

const HACKER_NEWS_HOSTS = new Set(["hnrss.org", "news.ycombinator.com", "hn.algolia.com"]);

/**
 * Hacker News is no longer offered as a source in the new-vault wizard (Step 4).
 * Used to strip it from AI-drafted blueprints; sources a user adds themselves,
 * and sources already stored on existing vaults, are left alone.
 */
export function isHackerNewsSource(source: Pick<BlueprintSource, "url" | "name">): boolean {
  try {
    if (HACKER_NEWS_HOSTS.has(new URL(source.url).hostname.replace(/^www\./, ""))) return true;
  } catch {
    // not a parseable URL — fall through to the name check
  }
  return /hacker\s*news/i.test(source.name);
}
