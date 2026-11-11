import { describe, expect, it } from "vitest";
import * as openai from "../src/adapters/openai.js";
import * as anthropic from "../src/adapters/anthropic.js";
import { promptToMessages } from "../src/input.js";
import type { Message, ToolDef } from "../src/types.js";

const tool: ToolDef = {
  name: "read_doc_contents",
  description: "Read a doc",
  inputSchema: { type: "object", properties: { doc_id: { type: "string" } }, required: ["doc_id"] },
};

const history: Message[] = [
  { role: "user", text: "read two docs" },
  {
    role: "assistant",
    text: "Sure",
    toolCalls: [
      { id: "c1", name: "read_doc_contents", args: { doc_id: "a" } },
      { id: "c2", name: "read_doc_contents", args: { doc_id: "b" } },
    ],
  },
  { role: "tool", callId: "c1", content: "AAA", isError: false },
  { role: "tool", callId: "c2", content: "not found", isError: true },
  { role: "assistant", text: "done", toolCalls: [] },
];

describe("openai adapter", () => {
  it("maps tools with strict:false", () => {
    expect(openai.toProviderTools([tool])).toEqual([
      { type: "function", name: tool.name, description: tool.description, parameters: tool.inputSchema, strict: false },
    ]);
  });

  it("maps history with calls and results", () => {
    expect(openai.toProviderMessages(history)).toEqual([
      { role: "user", content: "read two docs" },
      { role: "assistant", content: "Sure" },
      { type: "function_call", call_id: "c1", name: "read_doc_contents", arguments: '{"doc_id":"a"}' },
      { type: "function_call", call_id: "c2", name: "read_doc_contents", arguments: '{"doc_id":"b"}' },
      { type: "function_call_output", call_id: "c1", output: "AAA" },
      { type: "function_call_output", call_id: "c2", output: "Error: not found" },
      { role: "assistant", content: "done" },
    ]);
  });

  it("omits empty assistant text and echoes invalid raw arguments", () => {
    const items = openai.toProviderMessages([
      { role: "assistant", text: "", toolCalls: [{ id: "x", name: "t", args: {}, invalidArgs: "{oops" }] },
    ]);
    expect(items).toEqual([{ type: "function_call", call_id: "x", name: "t", arguments: "{oops" }]);
  });

  it("maps prompt messages", () => {
    const msgs = promptToMessages([{ role: "user", content: { type: "text", text: "Format it" } }]);
    expect(openai.toProviderMessages(msgs)).toEqual([{ role: "user", content: "Format it" }]);
  });

  it("parses a response with text and calls", () => {
    const turn = openai.fromProviderResponse({
      output: [
        { type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text: "hi", annotations: [] }] },
        { type: "function_call", call_id: "c1", name: "read_doc_contents", arguments: '{"doc_id":"a"}' },
      ],
    } as never);
    expect(turn).toEqual({
      role: "assistant",
      text: "hi",
      toolCalls: [{ id: "c1", name: "read_doc_contents", args: { doc_id: "a" } }],
    });
  });

  it("flags invalid JSON arguments instead of throwing", () => {
    const turn = openai.fromProviderResponse({
      output: [
        { type: "function_call", call_id: "c1", name: "t", arguments: "{not json" },
        { type: "function_call", call_id: "c2", name: "t", arguments: "[1]" },
        { type: "function_call", call_id: "c3", name: "t", arguments: "" },
      ],
    } as never);
    expect(turn.toolCalls[0]).toEqual({ id: "c1", name: "t", args: {}, invalidArgs: "{not json" });
    expect(turn.toolCalls[1]!.invalidArgs).toBe("[1]");
    expect(turn.toolCalls[2]).toEqual({ id: "c3", name: "t", args: {} });
  });

  it("OpenAiLlm sends mapped input to responses.create", async () => {
    let seen: Record<string, unknown> = {};
    const llm = new openai.OpenAiLlm(
      { responses: { create: async (p: Record<string, unknown>) => ((seen = p), { output: [] }) } } as never,
      "m",
    );
    await llm.complete(history.slice(0, 1), [tool]);
    expect(seen).toMatchObject({ model: "m", input: [{ role: "user", content: "read two docs" }] });
  });
});

describe("anthropic adapter", () => {
  it("maps tools to input_schema", () => {
    expect(anthropic.toProviderTools([tool])).toEqual([
      { name: tool.name, description: tool.description, input_schema: tool.inputSchema },
    ]);
  });

  it("maps history and merges consecutive tool results into one user message", () => {
    expect(anthropic.toProviderMessages(history)).toEqual([
      { role: "user", content: "read two docs" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Sure" },
          { type: "tool_use", id: "c1", name: "read_doc_contents", input: { doc_id: "a" } },
          { type: "tool_use", id: "c2", name: "read_doc_contents", input: { doc_id: "b" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "c1", content: "AAA", is_error: false },
          { type: "tool_result", tool_use_id: "c2", content: "not found", is_error: true },
        ],
      },
      { role: "assistant", content: [{ type: "text", text: "done" }] },
    ]);
  });

  it("skips empty assistant turns", () => {
    expect(anthropic.toProviderMessages([{ role: "assistant", text: "", toolCalls: [] }])).toEqual([]);
  });

  it("maps prompt messages including assistant text", () => {
    const msgs = promptToMessages([
      { role: "user", content: { type: "text", text: "q" } },
      { role: "assistant", content: { type: "text", text: "a" } },
    ]);
    expect(anthropic.toProviderMessages(msgs)).toEqual([
      { role: "user", content: "q" },
      { role: "assistant", content: [{ type: "text", text: "a" }] },
    ]);
  });

  it("parses text and tool_use blocks", () => {
    const turn = anthropic.fromProviderResponse({
      content: [
        { type: "thinking", thinking: "..." },
        { type: "text", text: "hi " },
        { type: "text", text: "there" },
        { type: "tool_use", id: "t1", name: "read_doc_contents", input: { doc_id: "a" } },
      ],
    } as never);
    expect(turn).toEqual({
      role: "assistant",
      text: "hi there",
      toolCalls: [{ id: "t1", name: "read_doc_contents", args: { doc_id: "a" } }],
    });
  });
});
