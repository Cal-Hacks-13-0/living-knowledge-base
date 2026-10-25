import { prisma } from "@/lib/db/prisma";
import { EmptyState } from "@/components/ui/empty-state";
import { AddSourceForm } from "@/components/sources/add-source-form";
import { SourceCard, type ProcessingIssue } from "@/components/sources/source-card";
import { PageEntrance } from "@/components/motion/page-entrance";
import { AnimatedText } from "@/components/motion/animated-text";
import { Radio } from "lucide-react";

export default async function SourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sources, lastRun] = await Promise.all([
    prisma.source.findMany({
      where: { knowledgeBaseId: id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { documents: true } } },
    }),
    prisma.researchRun.findFirst({
      where: { knowledgeBaseId: id, completedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { errorMessage: true },
    }),
  ]);
  const processingIssues = await processingIssuesBySource(id, lastRun?.errorMessage ?? null);

  return (
    <PageEntrance className="flex flex-col gap-5">
      {sources.length === 0 ? (
        <EmptyState icon={<Radio className="h-5 w-5" />} title="No sources tracked yet" />
      ) : (
        <AnimatedText delay={0.16} className="flex flex-col gap-3">
          {sources.map((source) => (
            <SourceCard
              key={source.id}
              knowledgeBaseId={id}
              processingIssue={processingIssues.get(source.id) ?? null}
              source={{
                id: source.id,
                name: source.name,
                url: source.url,
                type: source.type,
                status: source.status,
                lastError: source.lastError,
                lastCheckedAt: source.lastCheckedAt,
                lastSuccessfulFetchAt: source.lastSuccessfulFetchAt,
                documentCount: source._count.documents,
              }}
            />
          ))}
        </AnimatedText>
      )}

      <AnimatedText delay={0.3}>
        <AddSourceForm knowledgeBaseId={id} />
      </AnimatedText>
    </PageEntrance>
  );
}

/**
 * The last research run records per-document processing failures in its
 * notes as `AI processing failed for "<document title>": <reason>` (see
 * lib/research/orchestrator.ts). Map those documents back to their source so
 * the card can say the source works but some items couldn't be processed.
 */
async function processingIssuesBySource(knowledgeBaseId: string, runNotes: string | null) {
  const issues = new Map<string, ProcessingIssue>();
  if (!runNotes) return issues;
  const failures = [...runNotes.matchAll(/AI processing failed for "(.+?)": ([\s\S]*?)(?= \| |$)/g)].map((m) => ({ title: m[1], detail: m[2] }));
  if (failures.length === 0) return issues;
  const docs = await prisma.sourceDocument.findMany({
    where: { title: { in: failures.map((f) => f.title) }, source: { knowledgeBaseId } },
    select: { title: true, sourceId: true },
  });
  for (const f of failures) {
    const doc = docs.find((d) => d.title === f.title);
    if (!doc) continue;
    const prev = issues.get(doc.sourceId);
    issues.set(doc.sourceId, { count: (prev?.count ?? 0) + 1, detail: prev?.detail ?? `AI processing failed: ${f.detail}` });
  }
  return issues;
}
