import { prisma } from "@/lib/db/prisma";
import { BrandMenu } from "@/components/home/brand-menu";

// Full-width chrome for the homepage only: no sidebar. Every other page keeps
// the sidebar app shell in app/(shell)/layout.tsx. The header height (h-14)
// is mirrored by the stage in components/home/knowledge-library.tsx.
export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  // Inbox badge: proposed corrections waiting for approval (the Inbox lists them).
  const pendingProposals = await prisma.knowledgeChangeProposal.count({ where: { status: "PENDING" } });

  return (
    // `home-mono` re-points the colour tokens to the homepage's monochrome theme (globals.css).
    // The header sits above the full-viewport network sphere drawn by the page.
    <div className="home-mono flex min-h-dvh flex-col">
      <header className="relative z-20 flex h-14 shrink-0 items-center px-4">
        <BrandMenu inboxCount={pendingProposals} />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
