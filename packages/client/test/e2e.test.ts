import { afterAll, beforeAll, expect, it } from "vitest";
import { TOOL_NAMES } from "@docs-mcp/shared";
import { loadConfig } from "../src/config.js";
import { McpClient, stdioTransport } from "../src/mcp-client.js";

let mcp: McpClient;

beforeAll(async () => {
  // Spawns the built server (run `npm run build` first; `npm test` does).
  const { server } = loadConfig({ OPENAI_API_KEY: "unused" });
  mcp = await McpClient.connect(stdioTransport(server));
});
afterAll(() => mcp.close());

it("lists tools from the built server over stdio", async () => {
  const names = (await mcp.listTools()).map((t) => t.name).sort();
  expect(names).toEqual([TOOL_NAMES.EDIT_DOCUMENT, TOOL_NAMES.READ_DOC_CONTENTS]);
});
