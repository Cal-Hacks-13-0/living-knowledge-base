import { prisma } from "@/lib/db/prisma";
import { ShellWithAssistant } from "@/components/dashboard/shell-with-assistant";

// Single-user local mode (see README §9/§7) — there is no auth system, so the
// sidebar's profile footer is a static label rather than a logged-in session.
const LOCAL_USER_EMAIL = "huier2006@berkeley.edu";

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
