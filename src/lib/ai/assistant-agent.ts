import { generateText } from "./client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantContextEntry {
  title: string;
  summary: string;
}

export interface AssistantContextInsight {
  title: string;
  summary: string;
  type: string;
}

const SYSTEM_PROMPT = `You are the AI Assistant embedded in one specific Living Knowledge Base
workspace. You help the user understand and navigate what has already been researched and
stored for THIS knowledge base only.

Rules:
- Answer using only the knowledge context provided below. If the context doesn't cover
  the question, say so plainly instead of guessing or inventing facts.
- When you reference something from the context, name the entry/insight title so the user
  can find it in the Library or Insights tab.
- Be concise — this is a sidebar chat, not a report.`;

export async function answerKnowledgeBaseQuestion({
  knowledgeBaseName,
  userGoal,
  message,
  history,
  relevantEntries,
  recentInsights,
}: {
  knowledgeBaseName: string;
  userGoal: string;
  message: string;
  history: ChatMessage[];
  relevantEntries: AssistantContextEntry[];
  recentInsights: AssistantContextInsight[];
}): Promise<string> {
  const contextBlock = `Knowledge base: "${knowledgeBaseName}" (goal: "${userGoal}")

Relevant knowledge entries:
${
  relevantEntries.length > 0
    ? relevantEntries.map((e) => `- ${e.title}: ${e.summary}`).join("\n")
    : "(no matching entries found)"
}

Recent insights:
${
  recentInsights.length > 0
    ? recentInsights.map((i) => `- [${i.type}] ${i.title}: ${i.summary}`).join("\n")
    : "(none)"
}`;

  const conversation = history
    .slice(-8) // bound prompt size — recent turns are what matter for continuity
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt = `${contextBlock}

${conversation ? `Conversation so far:\n${conversation}\n` : ""}
User: ${message}

Respond as the Assistant.`;

  return generateText({ system: SYSTEM_PROMPT, prompt, maxTokens: 1024 });
}
