import { prisma } from "@/lib/db/prisma";
import { ShellWithAssistant } from "@/components/dashboard/shell-with-assistant";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  // Inbox badge: proposed corrections waiting for approval (the Inbox lists them).
  const [knowledgeBases, pendingProposals] = await Promise.all([
    prisma.knowledgeBase.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    }),
    prisma.knowledgeChangeProposal.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <ShellWithAssistant
      knowledgeBases={knowledgeBases}
      inboxCount={pendingProposals}
    >
      {children}
    </ShellWithAssistant>
  );
}
