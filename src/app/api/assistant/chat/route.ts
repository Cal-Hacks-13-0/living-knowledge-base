import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError } from "@/lib/api/response";
import { ChatRequestSchema } from "@/lib/validation/schemas";
import { answerAssistantQuestion } from "@/lib/ai/assistant-agent";

/**
 * Global AI Assistant chat — works across every knowledge base the user has,
 * not scoped to one. Ephemeral — history is passed in by the client on every
 * call, nothing is persisted server-side. Can call tools (fetch+archive a
 * URL into a KB, run research on a KB, or propose starting a new KB) — see
 * lib/ai/assistant-tools.ts. A request that triggers run_research_now can
 * take a while; there's no streaming, so this blocks until it's done.
 */
export async function POST(req: NextRequest) {
  try {
    const body = ChatRequestSchema.parse(await req.json());

    const knowledgeBases = await prisma.knowledgeBase.findMany({
      select: { id: true, name: true, userGoal: true },
      orderBy: { updatedAt: "desc" },
      take: 25,
    });

    // Reuse the same keyword-overlap approach as the per-KB retrieval /
    // cross-KB search endpoint — no separate retrieval system to maintain.
    const keywords = body.message
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2)
      .slice(0, 8);

    const entryWhere =
      keywords.length > 0
        ? { OR: keywords.flatMap((kw) => [{ title: { contains: kw } }, { summary: { contains: kw } }]) }
        : {};

    const [relevantEntries, recentInsights] = await Promise.all([
      prisma.knowledgeEntry.findMany({
        where: entryWhere,
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: { knowledgeBase: { select: { name: true } } },
      }),
      prisma.insight.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { knowledgeBase: { select: { name: true } } },
      }),
    ]);

    const answer = await answerAssistantQuestion({
      knowledgeBases,
      currentKnowledgeBaseId: body.currentKnowledgeBaseId ?? null,
      message: body.message,
      history: body.history,
      relevantEntries: relevantEntries.map((e) => ({
        knowledgeBaseName: e.knowledgeBase.name,
        title: e.title,
        summary: e.summary,
      })),
      recentInsights: recentInsights.map((i) => ({
        knowledgeBaseName: i.knowledgeBase.name,
        title: i.title,
        type: i.type,
        summary: i.summary,
      })),
    });

    return ok(answer);
  } catch (err) {
    return handleApiError(err);
  }
}
