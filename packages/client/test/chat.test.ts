import { describe, expect, it } from "vitest";
import { ChatSession, MAX_ITERATIONS } from "../src/chat.js";
import type { AssistantMessage, LlmClient, McpTools, Message, ToolCall, ToolResult } from "../src/types.js";

const call = (id: string, name = "echo", args: Record<string, unknown> = {}): ToolCall => ({ id, name, args });
const turn = (text: string, toolCalls: ToolCall[] = []): AssistantMessage => ({ role: "assistant", text, toolCalls });

class FakeLlm implements LlmClient {
  seen: Message[][] = [];
  constructor(private readonly script: (n: number) => AssistantMessage) {}
  async complete(history: readonly Message[]) {
    this.seen.push([...history]);
    return this.script(this.seen.length - 1);
  }
}

function fakeMcp(handler: (name: string, args: Record<string, unknown>) => ToolResult | Promise<ToolResult>) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const mcp: McpTools = {
    listTools: async () => [{ name: "echo", description: "", inputSchema: { type: "object" } }],
    callTool: async (name, args) => (calls.push([name, args]), handler(name, args)),
  };
  return { mcp, calls };
}

describe("ChatSession", () => {
  it("runs a tool call then returns the final text", async () => {
    const llm = new FakeLlm((n) => (n === 0 ? turn("", [call("c1", "echo", { x: 1 })]) : turn("all done")));
    const { mcp, calls } = fakeMcp(() => ({ content: "ok", isError: false }));
    const events: string[] = [];
    const session = new ChatSession(llm, mcp, {
      onToolCall: (c) => events.push(`call:${c.name}`),
      onText: (t) => events.push(`text:${t}`),
    });

    expect(await session.send("hi")).toBe("all done");
    expect(calls).toEqual([["echo", { x: 1 }]]);
    expect(events).toEqual(["call:echo", "text:all done"]);
    expect(session.history).toEqual([
      { role: "user", text: "hi" },
      turn("", [call("c1", "echo", { x: 1 })]),
      { role: "tool", callId: "c1", content: "ok", isError: false },
      turn("all done"),
    ]);
  });

  it("executes all tool calls from one turn, keeping order", async () => {
    const llm = new FakeLlm((n) => (n === 0 ? turn("", [call("a"), call("b"), call("c")]) : turn("fin")));
    const { mcp, calls } = fakeMcp(async (_n, args) => ({ content: "r", isError: false }));
    const session = new ChatSession(llm, mcp);
    await session.send("go");
    expect(calls).toHaveLength(3);
    expect(session.history.filter((m) => m.role === "tool").map((m) => (m as { callId: string }).callId)).toEqual(["a", "b", "c"]);
  });

  it("surfaces tool errors and thrown exceptions to the model", async () => {
    const llm = new FakeLlm((n) => (n === 0 ? turn("", [call("a"), call("b", "boom")]) : turn("sorry")));
    const { mcp } = fakeMcp((name) => {
      if (name === "boom") throw new Error("kaput");
      return { content: "no such doc", isError: true };
    });
    const session = new ChatSession(llm, mcp);
    await session.send("go");
    expect(llm.seen[1]!.filter((m) => m.role === "tool")).toEqual([
      { role: "tool", callId: "a", content: "no such doc", isError: true },
      { role: "tool", callId: "b", content: "kaput", isError: true },
    ]);
  });

  it("returns an error result for invalid arguments without calling the server", async () => {
    const bad: ToolCall = { id: "x", name: "echo", args: {}, invalidArgs: "{oops" };
    const llm = new FakeLlm((n) => (n === 0 ? turn("", [bad]) : turn("retry")));
    const { mcp, calls } = fakeMcp(() => ({ content: "", isError: false }));
    const session = new ChatSession(llm, mcp);
    await session.send("go");
    expect(calls).toHaveLength(0);
    expect(session.history[2]).toMatchObject({ role: "tool", callId: "x", isError: true });
  });

  it("stops after the iteration cap and says so", async () => {
    const llm = new FakeLlm((n) => turn("", [call(`c${n}`)]));
    const { mcp } = fakeMcp(() => ({ content: "ok", isError: false }));
    const texts: string[] = [];
    const session = new ChatSession(llm, mcp, { onText: (t) => texts.push(t) });
    const result = await session.send("loop");
    expect(llm.seen).toHaveLength(MAX_ITERATIONS);
    expect(result).toMatch(/10 tool-use iterations/);
    expect(texts).toEqual([result]);
    // history stays well-formed: every call has a result
    expect(session.history.at(-1)).toMatchObject({ role: "tool", callId: `c${MAX_ITERATIONS - 1}` });
  });

  it("accepts pre-built messages and keeps history across sends", async () => {
    const llm = new FakeLlm(() => turn("ok"));
    const session = new ChatSession(llm, fakeMcp(() => ({ content: "", isError: false })).mcp);
    await session.send([{ role: "user", text: "p1" }, { role: "assistant", text: "p2", toolCalls: [] }]);
    await session.send("next");
    expect(llm.seen[1]!.map((m) => m.role)).toEqual(["user", "assistant", "assistant", "user"]);
  });
});
