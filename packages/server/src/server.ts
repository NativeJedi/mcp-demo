import { McpServer } from "@modelcontextprotocol/server";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";
import type { DocumentStore } from "./store.js";

export function createServer(store: DocumentStore): McpServer {
  const server = new McpServer({ name: "docs-mcp-server", version: "0.1.0" });
  registerTools(server, store);
  registerResources(server, store);
  registerPrompts(server, store);
  return server;
}
