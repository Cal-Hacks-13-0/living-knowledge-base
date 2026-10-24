import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { HomeHero } from "@/components/setup/home-hero";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { BookOpen, Database, AlertCircle, Radio, Sparkles } from "lucide-react";

export default async function HomePage() {
  const [kbCount, entryCount, sourceCount, pendingInsights, pendingProposals, recentInsights] =
    await Promise.all([
      prisma.knowledgeBase.count(),
      prisma.knowledgeEntry.count(),
      prisma.source.count(),
      prisma.insight.count({ where: { status: "PENDING" } }),
      prisma.knowledgeChangeProposal.count({ where: { status: "PENDING" } }),
      prisma.insight.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { knowledgeBase: { select: { id: true, name: true } } },
      }),
    ]);

  const hasAnyKb = kbCount > 0;

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-4xl flex-col gap-10">
        <HomeHero compact={hasAnyKb} />

        {hasAnyKb && (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <StatCard label="Knowledge bases" value={kbCount} icon={<BookOpen className="h-3.5 w-3.5" />} />
              <StatCard label="Knowledge entries" value={entryCount} icon={<Database className="h-3.5 w-3.5" />} />
              <StatCard label="Tracked sources" value={sourceCount} icon={<Radio className="h-3.5 w-3.5" />} />
              <StatCard
                label="Needs your review"
                value={pendingInsights + pendingProposals}
                tone={pendingInsights + pendingProposals > 0 ? "warning" : "default"}
                icon={<AlertCircle className="h-3.5 w-3.5" />}
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
                {(pendingInsights > 0 || pendingProposals > 0) && (
                  <Link href="/inbox" className="text-xs font-medium text-accent">
                    Review inbox →
                  </Link>
                )}
              </div>
              {recentInsights.length === 0 ? (
                <EmptyState
                  icon={<Sparkles className="h-5 w-5" />}
                  title="No activity yet"
                  description="Run research on a knowledge base to start generating insights."
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {recentInsights.map((insight) => (
                    <Link
                      key={insight.id}
                      href={`/kb/${insight.knowledgeBase.id}/insights`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 hover:border-accent/30 hover:bg-surface"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{insight.title}</p>
                        <p className="text-xs text-muted">
                          {insight.knowledgeBase.name} · {formatDateTime(insight.createdAt)}
                        </p>
                      </div>
                      <Badge variant={insight.status === "PENDING" ? "warning" : "neutral"}>{insight.status}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
