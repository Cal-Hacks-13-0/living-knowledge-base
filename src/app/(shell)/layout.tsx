import { prisma } from "@/lib/db/prisma";
import { Sidebar } from "@/components/dashboard/sidebar";
import { LOCAL_USER_EMAIL } from "@/lib/local-user";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const [knowledgeBases, pendingInsights, pendingProposals] = await Promise.all([
    prisma.knowledgeBase.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    }),
    prisma.insight.count({ where: { status: "PENDING" } }),
    prisma.knowledgeChangeProposal.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <div className="flex h-dvh">
      <Sidebar
        knowledgeBases={knowledgeBases}
        inboxCount={pendingInsights + pendingProposals}
        userEmail={LOCAL_USER_EMAIL}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
