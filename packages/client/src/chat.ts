import type { LlmClient, McpTools, Message, ToolCall, ToolResult } from "./types.js";

export const MAX_ITERATIONS = 10;

export interface ChatCallbacks {
  onToolCall?(call: ToolCall): void;
  onText?(text: string): void;
}

/** Provider-neutral conversation with an LLM that can call MCP tools. */
export class ChatSession {
  readonly history: Message[] = [];

  constructor(
    private readonly llm: LlmClient,
    private readonly mcp: McpTools,
    private readonly callbacks: ChatCallbacks = {},
  ) {}

  /** Send a user message (or pre-built messages) and run the tool-use loop. Returns the final text. */
  async send(input: string | Message[]): Promise<string> {
    if (typeof input === "string") this.history.push({ role: "user", text: input });
    else this.history.push(...input);

    const tools = await this.mcp.listTools();
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const turn = await this.llm.complete(this.history, tools);
      this.history.push(turn);
      if (turn.text) this.callbacks.onText?.(turn.text);
      if (turn.toolCalls.length === 0) return turn.text;

      const results = await Promise.all(turn.toolCalls.map((call) => this.runTool(call)));
      turn.toolCalls.forEach((call, idx) => {
        const { content, isError } = results[idx]!;
        this.history.push({ role: "tool", callId: call.id, content, isError });
      });
    }
    const notice = `Stopped after ${MAX_ITERATIONS} tool-use iterations without a final answer.`;
    this.callbacks.onText?.(notice);
    return notice;
  }

  private async runTool(call: ToolCall): Promise<ToolResult> {
    this.callbacks.onToolCall?.(call);
    if (call.invalidArgs !== undefined) {
      return { content: `Invalid JSON arguments for ${call.name}: ${call.invalidArgs}`, isError: true };
    }
    try {
      return await this.mcp.callTool(call.name, call.args);
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  }
}
