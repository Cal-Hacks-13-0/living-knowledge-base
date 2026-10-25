import { prisma } from "@/lib/db/prisma";
import { ShellWithAssistant } from "@/components/dashboard/shell-with-assistant";
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
    <ShellWithAssistant
      knowledgeBases={knowledgeBases}
      inboxCount={pendingInsights + pendingProposals}
      userEmail={LOCAL_USER_EMAIL}
    >
      {children}
    </ShellWithAssistant>
  );
}
