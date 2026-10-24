import { prisma } from "@/lib/db/prisma";
import { EmptyState } from "@/components/ui/empty-state";
import { InsightCard } from "@/components/insights/insight-card";
import { ProposalCard } from "@/components/insights/proposal-card";
import { Sparkles, FileEdit } from "lucide-react";

export default async function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [insights, proposals] = await Promise.all([
    prisma.insight.findMany({
      where: { knowledgeBaseId: id },
      orderBy: { createdAt: "desc" },
      include: {
        evidence: {
          include: {
            sourceDocument: { select: { id: true, title: true, url: true } },
            knowledgeEntry: { select: { id: true, title: true } },
          },
        },
      },
    }),
    prisma.knowledgeChangeProposal.findMany({
      where: { knowledgeBaseId: id },
      orderBy: { createdAt: "desc" },
      include: { targetEntry: { select: { id: true, title: true, summary: true, content: true, status: true } } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Pending knowledge updates {proposals.filter((p) => p.status === "PENDING").length > 0 && `(${proposals.filter((p) => p.status === "PENDING").length})`}
        </h2>
        {proposals.length === 0 ? (
          <EmptyState icon={<FileEdit className="h-5 w-5" />} title="No proposed updates" description="Contradictions or replacement candidates found during research will show up here for your review." />
        ) : (
          <div className="flex flex-col gap-4">
            {proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Insights feed</h2>
        {insights.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="No insights yet"
            description="Run research from the Overview tab to generate evidence-backed insights."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
