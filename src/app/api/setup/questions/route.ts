import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/api/response";
import { SetupQuestionsRequestSchema } from "@/lib/validation/schemas";
import { generateSetupQuestions } from "@/lib/ai/setup-agent";

export async function POST(req: NextRequest) {
  try {
    const body = SetupQuestionsRequestSchema.parse(await req.json());
    const result = await generateSetupQuestions(body.userGoal, body.previousAnswers);
    return ok(result);
  } catch (err) {
    return handleApiError(err);
  }
}
