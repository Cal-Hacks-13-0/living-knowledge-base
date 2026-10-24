import type { BlueprintSource } from "@/lib/ai/schemas";

/**
 * Curated catalog of real, publicly reachable sources. The Blueprint Agent
 * (an LLM) is explicitly instructed to never claim a URL is "verified" since
 * it cannot browse the web to confirm a page is live — so we deterministically
 * merge in a small set of sources we know work, marked verified: true. This
 * keeps the end-to-end research loop grounded in content that actually
 * fetches, for any domain, instead of relying on the model to invent URLs.
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

function hnSearchFeed(topic: string): BlueprintSource {
  const query = topic.trim().slice(0, 80);
  return {
    name: `Hacker News search: "${query}"`,
    url: `https://hnrss.org/newest?q=${encodeURIComponent(query)}`,
    type: "RSS",
    verified: true,
    rationale:
      "Deterministic, always-reachable public RSS search feed (hnrss.org) seeded from your goal. Works for any topic and guarantees at least one monitorable source.",
  };
}

/**
 * Returns a small set of real, known-good sources relevant to the given
 * goal + category names. Always includes at least one HN keyword search
 * feed; adds GitHub Releases sources when the text matches known software
 * projects.
 */
export function discoverVerifiedSources(
  goalText: string,
  categoryNames: string[]
): BlueprintSource[] {
  const haystack = `${goalText} ${categoryNames.join(" ")}`.toLowerCase();
  const sources: BlueprintSource[] = [hnSearchFeed(goalText)];

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
