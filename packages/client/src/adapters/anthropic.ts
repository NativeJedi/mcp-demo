import type Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  Message as ApiMessage,
  MessageParam,
  Tool,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import type { AssistantMessage, LlmClient, Message, ToolCall, ToolDef } from "../types.js";

export const DEFAULT_MAX_TOKENS = 4096;

export function toProviderTools(tools: readonly ToolDef[]): Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Tool["input_schema"],
  }));
}

export function toProviderMessages(history: readonly Message[]): MessageParam[] {
  const out: MessageParam[] = [];
  for (const m of history) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.text });
    } else if (m.role === "assistant") {
      const content: ContentBlockParam[] = [];
      if (m.text) content.push({ type: "text", text: m.text });
      for (const c of m.toolCalls) content.push({ type: "tool_use", id: c.id, name: c.name, input: c.args });
      if (content.length > 0) out.push({ role: "assistant", content });
    } else {
      const block: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: m.callId,
        content: m.content,
        is_error: m.isError,
      };
      // The API wants all results for one assistant turn in a single user message.
      const last = out[out.length - 1];
      if (last?.role === "user" && Array.isArray(last.content) && last.content.every((b) => b.type === "tool_result")) {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    }
  }
  return out;
}

export function fromProviderResponse(response: Pick<ApiMessage, "content">): AssistantMessage {
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
    else if (block.type === "tool_use") {
      toolCalls.push({ id: block.id, name: block.name, args: (block.input ?? {}) as Record<string, unknown> });
    }
  }
  return { role: "assistant", text, toolCalls };
}

export class AnthropicLlm implements LlmClient {
  constructor(
    private readonly client: Pick<Anthropic, "messages">,
    private readonly model: string,
    private readonly maxTokens: number = DEFAULT_MAX_TOKENS,
  ) {}

  async complete(history: readonly Message[], tools: readonly ToolDef[]): Promise<AssistantMessage> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: toProviderMessages(history),
      tools: toProviderTools(tools),
    });
    return fromProviderResponse(response);
  }
}
