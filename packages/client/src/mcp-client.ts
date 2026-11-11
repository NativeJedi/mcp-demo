import { Client, type GetPromptResult, type Transport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { RESOURCE_URIS, documentUri } from "@docs-mcp/shared";
import type { McpTools, ToolDef, ToolResult } from "./types.js";

export interface PromptInfo {
  name: string;
  description?: string;
  args: { name: string; required: boolean }[];
}

export function stdioTransport(server: { command: string; args: string[]; cwd?: string }): Transport {
  return new StdioClientTransport(server);
}

/** One connection to the document MCP server. */
export class McpClient implements McpTools {
  private constructor(private readonly client: Client) {}

  static async connect(transport: Transport): Promise<McpClient> {
    const client = new Client({ name: "docs-mcp-client", version: "0.1.0" });
    await client.connect(transport);
    return new McpClient(client);
  }

  async listTools(): Promise<ToolDef[]> {
    const { tools } = await this.client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const res = await this.client.callTool({ name, arguments: args });
    const blocks = (res.content ?? []) as Array<{ type: string; text?: string }>;
    const content = blocks.map((b) => (b.type === "text" ? (b.text ?? "") : `[${b.type} content]`)).join("\n");
    return { content, isError: res.isError === true };
  }

  async listPrompts(): Promise<PromptInfo[]> {
    const { prompts } = await this.client.listPrompts();
    return prompts.map((p) => ({
      name: p.name,
      description: p.description,
      args: (p.arguments ?? []).map((a) => ({ name: a.name, required: a.required === true })),
    }));
  }

  getPrompt(name: string, args: Record<string, string> = {}): Promise<GetPromptResult> {
    return this.client.getPrompt({ name, arguments: args });
  }

  async listDocIds(): Promise<string[]> {
    const text = await this.readText(RESOURCE_URIS.DOCUMENTS);
    return JSON.parse(text) as string[];
  }

  readDocument(id: string): Promise<string> {
    return this.readText(documentUri(id));
  }

  /** Closing the client closes the transport, which terminates a stdio child process. */
  close(): Promise<void> {
    return this.client.close();
  }

  private async readText(uri: string): Promise<string> {
    const { contents } = await this.client.readResource({ uri });
    return contents.map((c) => ("text" in c ? c.text : "")).join("");
  }
}
