/** Provider-neutral conversation types. Adapters translate to/from vendor formats. */

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments; `{}` when `invalidArgs` is set. */
  args: Record<string, unknown>;
  /** Raw argument string the model sent when it was not valid JSON. */
  invalidArgs?: string;
}

export type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool"; callId: string; content: string; isError: boolean };

export type AssistantMessage = Extract<Message, { role: "assistant" }>;

/** A tool as advertised by the MCP server. */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

export interface LlmClient {
  complete(history: readonly Message[], tools: readonly ToolDef[]): Promise<AssistantMessage>;
}

/** The slice of the MCP client that ChatSession depends on. */
export interface McpTools {
  listTools(): Promise<ToolDef[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}
