import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { RunResearchButton } from "@/components/dashboard/run-research-button";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { BookOpen, Radio, Sparkles, Clock, AlertCircle } from "lucide-react";

export default async function KnowledgeBaseOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
  if (!kb) notFound();

  const [sourceCount, entryCount, lastRun, recentInsights, pendingInsights, pendingProposals] =
    await Promise.all([
      prisma.source.count({ where: { knowledgeBaseId: id } }),
      prisma.knowledgeEntry.count({ where: { knowledgeBaseId: id } }),
      prisma.researchRun.findFirst({
        where: { knowledgeBaseId: id, status: { in: ["COMPLETED", "PARTIAL"] } },
        orderBy: { startedAt: "desc" },
      }),
      prisma.insight.findMany({ where: { knowledgeBaseId: id }, orderBy: { createdAt: "desc" }, take: 4 }),
      prisma.insight.count({ where: { knowledgeBaseId: id, status: "PENDING" } }),
      prisma.knowledgeChangeProposal.count({ where: { knowledgeBaseId: id, status: "PENDING" } }),
    ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="text-sm text-muted">{kb.description}</p>
          <p className="mt-2 text-xs text-muted">Goal: &ldquo;{kb.userGoal}&rdquo;</p>
        </div>
        <RunResearchButton knowledgeBaseId={id} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Monitoring"
          value={kb.monitoringFrequency === "MANUAL" ? "Manual" : kb.monitoringFrequency}
          icon={<Radio className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Last successful run"
          value={lastRun ? timeAgo(lastRun.completedAt ?? lastRun.startedAt) : "Never"}
          icon={<Clock className="h-3.5 w-3.5" />}
        />
        <StatCard label="Tracked sources" value={sourceCount} icon={<BookOpen className="h-3.5 w-3.5" />} />
        <StatCard
          label="Needs your review"
          value={pendingInsights + pendingProposals}
          tone={pendingInsights + pendingProposals > 0 ? "warning" : "default"}
          icon={<AlertCircle className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>What&apos;s in the Knowledge Library</CardTitle>
            <Link href={`/kb/${id}/library`} className="text-xs font-medium text-accent">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted">
              {entryCount} knowledge entr{entryCount === 1 ? "y" : "ies"} stored so far, organized across
              your categories.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recently discovered</CardTitle>
            <Link href={`/kb/${id}/insights`} className="text-xs font-medium text-accent">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentInsights.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="h-5 w-5" />}
                title="No insights yet"
                description="Run research to let the agent analyze your sources."
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {recentInsights.map((insight) => (
                  <li key={insight.id} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{insight.title}</p>
                      <p className="text-xs text-muted">{formatDateTime(insight.createdAt)}</p>
                    </div>
                    <Badge variant={insight.status === "PENDING" ? "warning" : "neutral"}>
                      {insight.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {pendingInsights + pendingProposals > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                {pendingInsights} insight(s) and {pendingProposals} proposed change(s) await your review.
              </p>
              <p className="text-xs text-muted">Nothing is applied to your knowledge base until you approve it.</p>
            </div>
            <Link href={`/kb/${id}/insights`} className="text-sm font-medium text-accent">
              Review now →
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
