import { prisma } from "@/lib/db/prisma";
import { LibraryBrowser } from "@/components/library/library-browser";

export default async function LibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [entries, categories] = await Promise.all([
    prisma.knowledgeEntry.findMany({
      where: { knowledgeBaseId: id },
      orderBy: { updatedAt: "desc" },
      include: {
        category: { select: { id: true, name: true, parentId: true } },
        sourceDocument: { select: { id: true, url: true, title: true } },
        insightEvidence: { include: { insight: { select: { id: true, title: true } } } },
      },
    }),
    prisma.knowledgeCategory.findMany({
      where: { knowledgeBaseId: id, parentId: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { entries: true } } },
    }),
  ]);

  return <LibraryBrowser knowledgeBaseId={id} initialEntries={entries} categories={categories} />;
}
