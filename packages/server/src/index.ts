#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";
import { InMemoryDocumentStore } from "./store.js";

// stdout carries the MCP protocol — log to stderr only.
const store = new InMemoryDocumentStore();
serveStdio(() => createServer(store));
console.error("docs-mcp-server running on stdio");
