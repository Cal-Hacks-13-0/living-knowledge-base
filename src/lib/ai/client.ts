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
    // The API requires every tool_use to be answered by a tool_result in the
    // very next user turn, so the schema error goes back as that result.
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUse.id,
          is_error: true,
          content: `Your input did not match the required schema: ${lastError}. Please call the ${toolName} tool again with corrected input.`,
        },
      ],
    });
  }

  throw new Error(
    `Claude did not return output matching the ${toolName} schema after retry: ${lastError}`
  );
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
}

/**
 * Runs an agentic tool-use loop: Claude may call any of `tools` zero or more
 * times (each call routed through `executeTool`), and the loop feeds each
 * tool's result back until the model produces a final text reply or
 * `maxIterations` is hit. Used by the AI Assistant chat, which can fetch a
 * URL into the knowledge base or trigger a research run on request — see
 * lib/ai/assistant-tools.ts for what the tools actually do.
 *
 * `executeTool` is trusted to apply its own safety checks (e.g. the fetch
 * tool goes through the same SSRF-guarded safeFetch as everything else);
 * this loop itself only bounds *how many* tool calls one turn can make.
 */
export async function generateWithTools({
  system,
  initialPrompt,
  tools,
  executeTool,
  maxIterations = 4,
  maxTokens = 1024,
  model = DEFAULT_MODEL,
  fallbackReply,
}: {
  system: string;
  initialPrompt: string;
  tools: ToolDefinition[];
  executeTool: (name: string, input: unknown) => Promise<string>;
  maxIterations?: number;
  maxTokens?: number;
  model?: string;
  /** Reply when `maxIterations` runs out — e.g. to report changes the tools already made. */
  fallbackReply?: () => string;
}): Promise<string> {
  const anthropic = getClient();

  const anthropicTools: Anthropic.Tool[] = tools.map((t) => {
    const jsonSchema = z.toJSONSchema(t.inputSchema, { target: "draft-7" }) as Record<string, unknown>;
    delete jsonSchema.$schema;
    return { name: t.name, description: t.description, input_schema: jsonSchema as Anthropic.Tool.InputSchema };
  });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: initialPrompt }];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools: anthropicTools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (toolUses.length === 0) {
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      return textBlock?.text ?? "";
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      let resultText: string;
      try {
        resultText = await executeTool(toolUse.name, toolUse.input);
      } catch (err) {
        resultText = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: resultText });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return (
    fallbackReply?.() ??
    "I tried a few steps to do that but didn't finish — could you try again, maybe with a smaller request?"
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
