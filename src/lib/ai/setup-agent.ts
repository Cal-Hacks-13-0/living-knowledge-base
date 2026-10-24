import { generateStructured } from "./client";
import {
  SetupQuestionsResponseSchema,
  type OnboardingAnswer,
  type SetupQuestionsResponse,
} from "./schemas";

const SYSTEM_PROMPT = `You are the Setup Agent for "Living Knowledge Base", a product that builds
and continuously monitors a personal knowledge base for ANY domain the user cares about
(software, hobbies, business research, health, etc). You are domain-agnostic: never assume
the user means software development unless their goal says so.

Your job: ask the smallest number of clarifying questions needed to generate a good
knowledge base blueprint later. Ask at most 3 questions, fewer if the goal is already
clear. Good questions cover: the user's primary objective, their experience/familiarity
level, and any specific sub-topics, technologies, or constraints they care about.

Each question must have a stable id, a type of "single_select", "multi_select", or
"short_text", and 3-6 concise options for select types. Never ask a question whose answer
is already obvious from the goal text already provided.`;

export async function generateSetupQuestions(
  userGoal: string,
  previousAnswers: OnboardingAnswer[] = []
): Promise<SetupQuestionsResponse> {
  const prompt = `User's stated goal: "${userGoal}"

${
  previousAnswers.length > 0
    ? `Previously answered questions:\n${previousAnswers
        .map((a) => `- ${a.prompt}: ${Array.isArray(a.answer) ? a.answer.join(", ") : a.answer}`)
        .join("\n")}\n\nGiven these answers, decide if more clarification is needed.`
    : "This is the first round of onboarding for this goal."
}

Call the emit_result tool with up to 3 contextual questions (or an empty list if the goal
plus previous answers already fully specify what's needed to build a blueprint).`;

  return generateStructured({
    system: SYSTEM_PROMPT,
    prompt,
    schema: SetupQuestionsResponseSchema,
    toolName: "emit_result",
    maxTokens: 1024,
  });
}
