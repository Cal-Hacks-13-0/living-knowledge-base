import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, handleApiError, NotFoundError } from "@/lib/api/response";
import { ChatRequestSchema } from "@/lib/validation/schemas";
import { findRelevantEntries } from "@/lib/knowledge/repository";
import { answerKnowledgeBaseQuestion } from "@/lib/ai/assistant-agent";

/**
 * AI Assistant chat, scoped to one knowledge base. Ephemeral — history is
 * passed in by the client on every call, nothing is persisted server-side
 * (see docs/frontend-redesign-plan.md §4 for why: v1 scope decision).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb) throw new NotFoundError(`Knowledge vault not found: ${id}`);

    const body = ChatRequestSchema.parse(await req.json());

    // Reuse the same keyword-overlap retrieval the Comparison Agent uses
    // during research runs — no separate retrieval system to maintain.
    const keywords = body.message
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2)
      .slice(0, 8);
    const [relevantEntries, recentInsights] = await Promise.all([
      findRelevantEntries(id, keywords, 6),
      prisma.insight.findMany({
        where: { knowledgeBaseId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const reply = await answerKnowledgeBaseQuestion({
      knowledgeBaseName: kb.name,
      userGoal: kb.userGoal,
      message: body.message,
      history: body.history,
      relevantEntries: relevantEntries.map((e) => ({ title: e.title, summary: e.summary })),
      recentInsights: recentInsights.map((i) => ({ title: i.title, summary: i.summary, type: i.type })),
    });

    return ok({ reply });
  } catch (err) {
    return handleApiError(err);
  }
}
