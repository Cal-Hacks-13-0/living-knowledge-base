import { prisma } from "@/lib/db/prisma";

export interface SourceIssue {
  id: string;
  name: string;
  url: string;
  lastError: string;
  vault: { id: string; name: string };
}

/**
 * Sources currently failing to fetch, across every knowledge vault — shown
 * in the Inbox as a low-priority, collapsed list (never inline with the
 * week's findings). Raw parser/HTTP errors are real but not something a
 * user needs to read to understand their week; this just makes them
 * reachable instead of silent.
 */
export async function listSourceIssues(): Promise<SourceIssue[]> {
  const sources = await prisma.source.findMany({
    where: { status: "ERROR", lastError: { not: null } },
    orderBy: { lastCheckedAt: "desc" },
    select: { id: true, name: true, url: true, lastError: true, knowledgeBase: { select: { id: true, name: true } } },
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    lastError: s.lastError!,
    vault: s.knowledgeBase,
  }));
}
