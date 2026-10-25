import { prisma } from "@/lib/db/prisma";
import { KnowledgeLibrary } from "@/components/home/knowledge-library";

export default async function HomePage() {
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, _count: { select: { entries: true, sources: true } } },
  });

  return (
    <KnowledgeLibrary
      knowledgeBases={knowledgeBases.map((kb) => ({
        id: kb.id,
        name: kb.name,
        entryCount: kb._count.entries,
        sourceCount: kb._count.sources,
      }))}
    />
  );
}
