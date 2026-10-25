import { generateWithTools } from "./client";
import { buildAssistantTools } from "./assistant-tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantKnowledgeBaseSummary {
  id: string;
  name: string;
  userGoal: string;
}

export interface AssistantContextEntry {
  knowledgeBaseName: string;
  title: string;
  summary: string;
}

export interface AssistantContextInsight {
  knowledgeBaseName: string;
  title: string;
  type: string;
  summary: string;
}

export interface AssistantAnswer {
  reply: string;
  suggestedKnowledgeBase: { goal: string } | null;
}

const SYSTEM_PROMPT = `You are the AI Assistant for "Axion" — a global assistant that works
across ALL of the user's knowledge vaults, not just one. You help the user understand
what's already been researched, and you can take action on their behalf:

1. fetch_and_archive_url — when the user shares/pastes a URL and wants it added to one of
   their EXISTING knowledge vaults, fetch it and archive it rather than just describing
   what you'd do. You must pick which knowledgeBaseId it belongs to — use the one the
   user names, or the one they're currently viewing if given, or ask them to clarify if
   it's genuinely ambiguous. Never guess a knowledgeBaseId that wasn't given to you.
2. run_research_now — when the user asks to check for updates, fetch the latest content,
   or refresh a knowledge vault, actually run it rather than just describing what a
   research run would do. This can take a while (up to a couple minutes) — let the user
   know that when you use it.
3. propose_new_knowledge_base — when the user describes wanting to track/learn/build
   something that ISN'T one of their existing knowledge vaults (a genuinely new topic),
   call this instead of fetch_and_archive_url/run_research_now. It shows the user a
   confirmation card to start the creation flow with their goal pre-filled — it does not
   create anything itself, so never say a new knowledge vault was created.

Rules:
- For plain questions (no action requested), answer using only the knowledge context
  provided below. If the context doesn't cover the question, say so plainly instead of
  guessing or inventing facts.
- When you reference something from the context, name both the knowledge vault and the
  entry/insight title so the user can find it.
- After using a tool, summarize what actually happened (the tool's result) in your own
  words — don't just repeat it verbatim, and don't claim something succeeded if the tool
  result says otherwise.
- Be concise — this is a sidebar chat, not a report.

In any text the user will read, call their collection a "knowledge vault" (never "knowledge base").`;

export async function answerAssistantQuestion({
  knowledgeBases,
  currentKnowledgeBaseId,
  message,
  history,
  relevantEntries,
  recentInsights,
}: {
  knowledgeBases: AssistantKnowledgeBaseSummary[];
  currentKnowledgeBaseId: string | null;
  message: string;
  history: ChatMessage[];
  relevantEntries: AssistantContextEntry[];
  recentInsights: AssistantContextInsight[];
}): Promise<AssistantAnswer> {
  const currentKb = knowledgeBases.find((kb) => kb.id === currentKnowledgeBaseId) ?? null;

  const contextBlock = `The user's knowledge vaults (id | name | goal):
${
  knowledgeBases.length > 0
    ? knowledgeBases.map((kb) => `- ${kb.id} | ${kb.name} | ${kb.userGoal}`).join("\n")
    : "(the user has no knowledge vaults yet)"
}

${
  currentKb
    ? `The user is currently viewing: "${currentKb.name}" (id: ${currentKb.id}) — default to this one if they don't specify which knowledge vault they mean.\n`
    : "The user is not currently viewing any specific knowledge vault.\n"
}
Relevant knowledge entries across all knowledge vaults:
${
  relevantEntries.length > 0
    ? relevantEntries.map((e) => `- [${e.knowledgeBaseName}] ${e.title}: ${e.summary}`).join("\n")
    : "(no matching entries found)"
}

Recent insights across all knowledge vaults:
${
  recentInsights.length > 0
    ? recentInsights.map((i) => `- [${i.knowledgeBaseName}][${i.type}] ${i.title}: ${i.summary}`).join("\n")
    : "(none)"
}`;

  const conversation = history
    .slice(-8) // bound prompt size — recent turns are what matter for continuity
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt = `${contextBlock}

${conversation ? `Conversation so far:\n${conversation}\n` : ""}
User: ${message}

Respond as the Assistant. Use a tool if the user's message calls for one.`;

  let suggestedKnowledgeBase: { goal: string } | null = null;
  const { definitions, execute } = buildAssistantTools({
    onProposeKnowledgeBase: (goal) => {
      suggestedKnowledgeBase = { goal };
    },
  });

  const reply = await generateWithTools({
    system: SYSTEM_PROMPT,
    initialPrompt: prompt,
    tools: definitions,
    executeTool: execute,
    maxTokens: 1024,
  });

  return { reply, suggestedKnowledgeBase };
}
