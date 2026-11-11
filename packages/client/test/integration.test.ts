import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { PROMPT_NAMES, TOOL_NAMES } from "@docs-mcp/shared";
import { createServer } from "../../server/src/server.js";
import { InMemoryDocumentStore, SEED_DOCUMENTS } from "../../server/src/store.js";
import { ChatSession } from "../src/chat.js";
import { handleLine, type Host } from "../src/cli.js";
import { McpClient } from "../src/mcp-client.js";
import type { AssistantMessage, LlmClient, Message } from "../src/types.js";

class ScriptedLlm implements LlmClient {
  seen: Message[][] = [];
  constructor(private readonly replies: AssistantMessage[]) {}
  async complete(history: readonly Message[]) {
    this.seen.push([...history]);
    return this.replies[this.seen.length - 1] ?? { role: "assistant" as const, text: "done", toolCalls: [] };
  }
}

let mcp: McpClient;
let store: InMemoryDocumentStore;
let printed: string[];
let closeAll: () => Promise<void>;

beforeEach(async () => {
  store = new InMemoryDocumentStore();
  const server = createServer(store);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const [client] = await Promise.all([McpClient.connect(clientT), server.connect(serverT)]);
  mcp = client;
  printed = [];
  closeAll = async () => {
    await mcp.close();
    await server.close();
  };
});
afterEach(() => closeAll());

const host = (llm: LlmClient): Host => ({ mcp, session: new ChatSession(llm, mcp), print: (t) => printed.push(t) });

describe("client against the real server", () => {
  it("lists doc ids and reads documents", async () => {
    expect((await mcp.listDocIds()).sort()).toEqual(Object.keys(SEED_DOCUMENTS).sort());
    expect(await mcp.readDocument("plan.md")).toBe(SEED_DOCUMENTS["plan.md"]);
  });

  it("injects @mentioned documents into the user message and warns on unknown ids", async () => {
    const llm = new ScriptedLlm([]);
    await handleLine("summarize @plan.md and @ghost.md", host(llm));
    const first = llm.seen[0]![0]!;
    expect(first).toMatchObject({ role: "user" });
    expect((first as { text: string }).text).toContain(`<document id="plan.md">\n${SEED_DOCUMENTS["plan.md"]}\n</document>`);
    expect((first as { text: string }).text).not.toContain('<document id="ghost.md">');
    expect(printed).toEqual(["Unknown document @ghost.md (ignored)"]);
  });

  it("converts a /format prompt into a neutral user message", async () => {
    const llm = new ScriptedLlm([]);
    expect(PROMPT_NAMES.FORMAT).toBe("format");
    await handleLine(`/${PROMPT_NAMES.FORMAT} report.pdf`, host(llm));
    const msg = llm.seen[0]![0] as { role: string; text: string };
    expect(msg.role).toBe("user");
    expect(msg.text).toContain("report.pdf");
    expect(msg.text).toContain(TOOL_NAMES.EDIT_DOCUMENT);
  });

  it("round-trips a real edit_document call", async () => {
    const llm = new ScriptedLlm([
      {
        role: "assistant",
        text: "",
        toolCalls: [
          {
            id: "c1",
            name: TOOL_NAMES.EDIT_DOCUMENT,
            args: { doc_id: "plan.md", old_str: "implementation", new_str: "rollout" },
          },
        ],
      },
    ]);
    await handleLine("edit the plan", host(llm));
    expect(await store.get("plan.md")).toContain("rollout");
    const toolMsg = llm.seen[1]!.at(-1)!;
    expect(toolMsg).toMatchObject({ role: "tool", callId: "c1", isError: false });
  });

  it("returns isError for a missing document", async () => {
    const res = await mcp.callTool(TOOL_NAMES.READ_DOC_CONTENTS, { doc_id: "nope" });
    expect(res.isError).toBe(true);
  });

  it("handles built-ins and bad commands", async () => {
    const h = host(new ScriptedLlm([]));
    expect(await handleLine("/exit", h)).toBe("exit");
    await handleLine("/tools", h);
    await handleLine("/nope", h);
    await handleLine("/format", h);
    expect(printed.some((l) => l.startsWith(TOOL_NAMES.READ_DOC_CONTENTS))).toBe(true);
    expect(printed).toContain("Unknown command /nope. Try /help.");
    expect(printed).toContain("Usage: /format <doc_id>");
  });
});
