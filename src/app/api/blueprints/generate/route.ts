import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/api/response";
import { BlueprintGenerateRequestSchema } from "@/lib/validation/schemas";
import { generateBlueprint } from "@/lib/ai/blueprint-agent";

export async function POST(req: NextRequest) {
  try {
    const body = BlueprintGenerateRequestSchema.parse(await req.json());
    const result = await generateBlueprint(body.userGoal, body.answers, body.preferences);
    return ok(result);
  } catch (err) {
    return handleApiError(err);
  }
}
