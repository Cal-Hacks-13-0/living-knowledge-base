import type {
  KnowledgeBase,
  KnowledgeCategory,
  KnowledgeEntry,
  Insight,
  Source,
  SourceDocument,
  InsightEvidence,
  KnowledgeChangeProposal,
} from "@prisma/client";

/** JSON-encoding string frontmatter values sidesteps YAML quoting edge cases
 * (colons, quotes, newlines) entirely — a JSON string is also a valid YAML
 * flow scalar. */
function toFrontmatter(fields: Record<string, string | number | boolean | null | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => {
      if (value === null) return `${key}: null`;
      if (typeof value === "string") return `${key}: ${JSON.stringify(value)}`;
      return `${key}: ${value}`;
    });
  return `---\n${lines.join("\n")}\n---\n`;
}

export function renderKbOverview(
  kb: KnowledgeBase,
  categories: KnowledgeCategory[],
  sources: Source[]
): string {
  const topLevel = categories.filter((c) => !c.parentId);
  const frontmatter = toFrontmatter({
    id: kb.id,
    type: "knowledge-base",
    name: kb.name,
    monitoringFrequency: kb.monitoringFrequency,
    createdAt: kb.createdAt.toISOString(),
    updatedAt: kb.updatedAt.toISOString(),
  });

  const categoryLinks = topLevel.map((c) => `- [[${c.name}]]`).join("\n") || "_(none yet)_";
  const sourceLines =
    sources.map((s) => `- **${s.name}** — ${s.url} _(${s.type}, ${s.status})_`).join("\n") || "_(none yet)_";

  return `${frontmatter}
# ${kb.name}

> ${kb.description}

**Goal:** ${kb.userGoal}
**Monitoring frequency:** ${kb.monitoringFrequency}

## Categories

${categoryLinks}

## Sources

${sourceLines}

---
_This file is auto-generated from the Axion app's database — edits here
are not synced back. See \`02_Knowledge/\` for entries, \`03_Insights/\` for insights,
\`04_Proposals/\` for pending review items._
`;
}

export function renderKnowledgeEntry(
  entry: KnowledgeEntry,
  category: KnowledgeCategory | null,
  sourceDocument: (SourceDocument & { source: Source }) | null
): string {
  const frontmatter = toFrontmatter({
    id: entry.id,
    type: "knowledge-entry",
    title: entry.title,
    status: entry.status,
    category: category?.name ?? null,
    sourceUrl: sourceDocument?.url ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  });

  return `${frontmatter}
# ${entry.title}

${entry.summary}

## Details

${entry.content}
${
  sourceDocument
    ? `\n## Source\n\n[${sourceDocument.title}](${sourceDocument.url}) via ${sourceDocument.source.name}\n`
    : ""
}${category ? `\n**Category:** [[${category.name}]]\n` : ""}`;
}

export function renderInsight(
  insight: Insight,
  evidence: Array<InsightEvidence & { sourceDocument: SourceDocument; knowledgeEntry: KnowledgeEntry | null }>
): string {
  const frontmatter = toFrontmatter({
    id: insight.id,
    type: "insight",
    insightType: insight.type,
    status: insight.status,
    confidence: insight.confidence,
    createdAt: insight.createdAt.toISOString(),
  });

  const evidenceLines =
    evidence
      .map((e) => {
        const entryLink = e.knowledgeEntry ? ` — relates to [[${e.knowledgeEntry.title}]]` : "";
        return `- [${e.sourceDocument.title}](${e.sourceDocument.url})${entryLink}\n  ${e.explanation}`;
      })
      .join("\n") || "_(none)_";

  return `${frontmatter}
# ${insight.title}

**Type:** ${insight.type} · **Confidence:** ${Math.round(insight.confidence * 100)}% · **Status:** ${insight.status}

## Summary

${insight.summary}

## Why it matters

${insight.whyItMatters}

## Recommended action

${insight.recommendedAction}

## Evidence

${evidenceLines}
`;
}

export function renderSource(source: Source, documents: SourceDocument[]): string {
  const frontmatter = toFrontmatter({
    id: source.id,
    type: "source",
    name: source.name,
    url: source.url,
    sourceType: source.type,
    status: source.status,
    lastCheckedAt: source.lastCheckedAt?.toISOString() ?? null,
    lastSuccessfulFetchAt: source.lastSuccessfulFetchAt?.toISOString() ?? null,
  });

  const docLines =
    documents
      .slice(0, 100)
      .map((d) => `- [${d.title}](${d.url}) — fetched ${d.fetchedAt.toISOString().slice(0, 10)}`)
      .join("\n") || "_(no documents fetched yet)_";

  return `${frontmatter}
# ${source.name}

**URL:** ${source.url}
**Type:** ${source.type} · **Status:** ${source.status}
${source.lastError ? `**Last error:** ${source.lastError}\n` : ""}
## Fetched documents (most recent ${Math.min(documents.length, 100)} of ${documents.length})

${docLines}
`;
}

export function renderProposal(
  proposal: KnowledgeChangeProposal,
  targetEntry: KnowledgeEntry | null
): string {
  let parsed: { operation: string; explanation: string; proposed: { title: string; summary: string } } | null = null;
  try {
    parsed = JSON.parse(proposal.proposedContent);
  } catch {
    parsed = null;
  }

  const frontmatter = toFrontmatter({
    id: proposal.id,
    type: "proposal",
    operation: proposal.operation,
    status: proposal.status,
    createdAt: proposal.createdAt.toISOString(),
  });

  return `${frontmatter}
# ${parsed?.proposed.title ?? targetEntry?.title ?? "Proposed knowledge update"}

**Operation:** ${proposal.operation} · **Status:** ${proposal.status}
${targetEntry ? `**Target entry:** [[${targetEntry.title}]]\n` : ""}
${parsed?.explanation ? `## Why\n\n${parsed.explanation}\n` : ""}
${parsed?.proposed.summary ? `## Proposed change\n\n${parsed.proposed.summary}\n` : ""}
`;
}
