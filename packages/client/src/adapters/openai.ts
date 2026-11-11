import type OpenAI from "openai";
import type {
  FunctionTool,
  Response,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import type { AssistantMessage, LlmClient, Message, ToolCall, ToolDef } from "../types.js";

export function toProviderTools(tools: readonly ToolDef[]): FunctionTool[] {
  return tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
    strict: false,
  }));
}

export function toProviderMessages(history: readonly Message[]): ResponseInputItem[] {
  const items: ResponseInputItem[] = [];
  for (const m of history) {
    if (m.role === "user") {
      items.push({ role: "user", content: m.text });
    } else if (m.role === "assistant") {
      if (m.text) items.push({ role: "assistant", content: m.text });
      for (const c of m.toolCalls) {
        items.push({
          type: "function_call",
          call_id: c.id,
          name: c.name,
          arguments: c.invalidArgs ?? JSON.stringify(c.args),
        });
      }
    } else {
      items.push({
        type: "function_call_output",
        call_id: m.callId,
        output: m.isError ? `Error: ${m.content}` : m.content,
      });
    }
  }
  return items;
}

export function fromProviderResponse(response: Pick<Response, "output">): AssistantMessage {
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const item of response.output) {
    if (item.type === "message") {
      for (const part of item.content) if (part.type === "output_text") text += part.text;
    } else if (item.type === "function_call") {
      toolCalls.push(parseCall(item.call_id, item.name, item.arguments));
    }
  }
  return { role: "assistant", text, toolCalls };
}

function parseCall(id: string, name: string, raw: string): ToolCall {
  try {
    const parsed: unknown = raw.trim() === "" ? {} : JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { id, name, args: parsed as Record<string, unknown> };
    }
  } catch {
    // fall through
  }
  return { id, name, args: {}, invalidArgs: raw };
}

export class OpenAiLlm implements LlmClient {
  constructor(
    private readonly client: Pick<OpenAI, "responses">,
    private readonly model: string,
  ) {}

  async complete(history: readonly Message[], tools: readonly ToolDef[]): Promise<AssistantMessage> {
    const response = await this.client.responses.create({
      model: this.model,
      input: toProviderMessages(history),
      tools: toProviderTools(tools),
    });
    return fromProviderResponse(response);
  }
}
