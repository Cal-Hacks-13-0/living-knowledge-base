import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { KbWorkspace } from "@/components/dashboard/kb-workspace";

export default async function KnowledgeBaseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const kb = await prisma.knowledgeBase.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!kb) notFound();

  return (
    <KbWorkspace knowledgeBaseId={id} knowledgeBaseName={kb.name}>
      {children}
    </KbWorkspace>
  );
}
