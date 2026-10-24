import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { EmptyState } from "@/components/ui/empty-state";
import { InsightCard } from "@/components/insights/insight-card";
import { ProposalCard } from "@/components/insights/proposal-card";
import { Inbox as InboxIcon } from "lucide-react";

export default async function InboxPage() {
  const [insights, proposals] = await Promise.all([
    prisma.insight.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        knowledgeBase: { select: { id: true, name: true } },
        evidence: {
          include: {
            sourceDocument: { select: { id: true, title: true, url: true } },
            knowledgeEntry: { select: { id: true, title: true } },
          },
        },
      },
    }),
    prisma.knowledgeChangeProposal.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        knowledgeBase: { select: { id: true, name: true } },
        targetEntry: { select: { id: true, title: true, summary: true, content: true, status: true } },
      },
    }),
  ]);

  const isEmpty = insights.length === 0 && proposals.length === 0;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Inbox</h1>
        <p className="mt-1 text-sm text-muted">
          Everything pending review across all your knowledge bases — {insights.length} insight(s),{" "}
          {proposals.length} proposed update(s).
        </p>
      </div>

      {isEmpty ? (
        <EmptyState icon={<InboxIcon className="h-6 w-6" />} title="Inbox zero" description="Nothing needs your review right now." />
      ) : (
        <div className="flex flex-col gap-8">
          {proposals.map((p) => (
            <div key={p.id} className="flex flex-col gap-1.5">
              <Link href={`/kb/${p.knowledgeBase.id}`} className="w-fit text-xs font-medium text-muted hover:text-accent">
                {p.knowledgeBase.name}
              </Link>
              <ProposalCard proposal={p} />
            </div>
          ))}
          {insights.map((insight) => (
            <div key={insight.id} className="flex flex-col gap-1.5">
              <Link href={`/kb/${insight.knowledgeBase.id}`} className="w-fit text-xs font-medium text-muted hover:text-accent">
                {insight.knowledgeBase.name}
              </Link>
              <InsightCard insight={insight} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
