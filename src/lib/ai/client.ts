import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

let client: Anthropic | null = null;

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set. Add it to your .env file to enable AI features. See .env.example."
    );
    this.name = "MissingApiKeyError";
  }
}

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new MissingApiKeyError();
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Calls Claude with a forced tool-use call so the response is guaranteed to
 * match the given Zod schema (Anthropic's equivalent of OpenAI Structured
 * Outputs). Throws if the model's output fails schema validation after one
 * retry with the validation error fed back to the model.
 */
export async function generateStructured<T extends z.ZodTypeAny>({
  system,
  prompt,
  schema,
  toolName = "emit_result",
  maxTokens = 2048,
  model = DEFAULT_MODEL,
}: {
  system: string;
  prompt: string;
  schema: T;
  toolName?: string;
  maxTokens?: number;
  model?: string;
}): Promise<z.infer<T>> {
  const anthropic = getClient();
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<
    string,
    unknown
  >;
  // Anthropic tool input schemas don't support top-level $schema/additionalProperties: false
  // combos reliably across all fields; strip $schema which is irrelevant here.
  delete jsonSchema.$schema;

  const tool: Anthropic.Tool = {
    name: toolName,
    description: "Emit the structured result for this task.",
    input_schema: jsonSchema as Anthropic.Tool.InputSchema,
  };

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (lastError) {
      messages.push({
        role: "user",
        content: `Your previous response did not match the required schema: ${lastError}. Please call the ${toolName} tool again with corrected input.`,
      });
    }

    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: toolName },
      messages,
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUse) {
      lastError = "no tool_use block returned";
      continue;
    }

    const parsed = schema.safeParse(toolUse.input);
    if (parsed.success) {
      return parsed.data;
    }
    lastError = parsed.error.message;
    messages.push({
      role: "assistant",
      content: response.content,
    });
  }

  throw new Error(
    `Claude did not return output matching the ${toolName} schema after retry: ${lastError}`
  );
}

/** Plain text generation, for cases that don't need structured output. */
export async function generateText({
  system,
  prompt,
  maxTokens = 1024,
  model = DEFAULT_MODEL,
}: {
  system: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
}): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  return textBlock?.text ?? "";
}
