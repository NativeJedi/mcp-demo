import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { PROMPT_NAMES, RESOURCE_URIS, TOOL_NAMES, documentUri } from "@docs-mcp/shared";
import { createServer } from "../src/server.js";
import { InMemoryDocumentStore, SEED_DOCUMENTS } from "../src/store.js";

let client: Client;
let store: InMemoryDocumentStore;
let close: () => Promise<void>;

beforeEach(async () => {
  store = new InMemoryDocumentStore();
  const server = createServer(store);
  client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  close = async () => {
    await client.close();
    await server.close();
  };
});

afterEach(async () => {
  await close();
});

const firstText = (result: { content?: unknown }) =>
  (result.content as Array<{ type: string; text: string }>)[0]!.text;

describe("tools", () => {
  it("lists tools with annotations and described inputs", async () => {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual([TOOL_NAMES.EDIT_DOCUMENT, TOOL_NAMES.READ_DOC_CONTENTS]);
    expect(byName[TOOL_NAMES.READ_DOC_CONTENTS]!.annotations?.readOnlyHint).toBe(true);
    expect(byName[TOOL_NAMES.EDIT_DOCUMENT]!.annotations?.destructiveHint).toBe(true);
    for (const tool of tools) {
      const props = (tool.inputSchema as { properties: Record<string, { description?: string }> }).properties;
      for (const [name, schema] of Object.entries(props)) {
        expect(schema.description, `${tool.name}.${name}`).toBeTruthy();
      }
    }
  });

  it("read_doc_contents returns the text", async () => {
    const res = await client.callTool({ name: TOOL_NAMES.READ_DOC_CONTENTS, arguments: { doc_id: "plan.md" } });
    expect(res.isError).toBeFalsy();
    expect(firstText(res)).toBe(SEED_DOCUMENTS["plan.md"]);
  });

  it("read_doc_contents errors on a missing doc", async () => {
    const res = await client.callTool({ name: TOOL_NAMES.READ_DOC_CONTENTS, arguments: { doc_id: "nope" } });
    expect(res.isError).toBe(true);
  });

  it("edit_document replaces an exact string", async () => {
    const res = await client.callTool({
      name: TOOL_NAMES.EDIT_DOCUMENT,
      arguments: { doc_id: "plan.md", old_str: "implementation", new_str: "$& rollout" },
    });
    expect(res.isError).toBeFalsy();
    expect(await store.get("plan.md")).toBe("The plan outlines the steps for the project's $& rollout.");
  });

  it("edit_document errors on a missing doc or missing old_str", async () => {
    const missingDoc = await client.callTool({
      name: TOOL_NAMES.EDIT_DOCUMENT,
      arguments: { doc_id: "nope", old_str: "a", new_str: "b" },
    });
    expect(missingDoc.isError).toBe(true);

    const missingStr = await client.callTool({
      name: TOOL_NAMES.EDIT_DOCUMENT,
      arguments: { doc_id: "plan.md", old_str: "does not appear", new_str: "b" },
    });
    expect(missingStr.isError).toBe(true);
    expect(await store.get("plan.md")).toBe(SEED_DOCUMENTS["plan.md"]);
  });
});

describe("resources", () => {
  it("reads the document id list as JSON", async () => {
    const { contents } = await client.readResource({ uri: RESOURCE_URIS.DOCUMENTS });
    expect(contents[0]!.mimeType).toBe("application/json");
    expect(JSON.parse((contents[0] as { text: string }).text)).toEqual(Object.keys(SEED_DOCUMENTS));
  });

  it("reads a single document as text/plain", async () => {
    const { contents } = await client.readResource({ uri: documentUri("spec.txt") });
    expect(contents[0]!.mimeType).toBe("text/plain");
    expect((contents[0] as { text: string }).text).toBe(SEED_DOCUMENTS["spec.txt"]);
  });

  it("rejects reading an unknown document", async () => {
    await expect(client.readResource({ uri: documentUri("nope") })).rejects.toThrow();
  });

  it("lists concrete documents and the template", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain(RESOURCE_URIS.DOCUMENTS);
    expect(uris).toContain(documentUri("report.pdf"));
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate)).toEqual([RESOURCE_URIS.DOCUMENT_TEMPLATE]);
  });

  it("completes doc_id for the template", async () => {
    const res = await client.complete({
      ref: { type: "ref/resource", uri: RESOURCE_URIS.DOCUMENT_TEMPLATE },
      argument: { name: "doc_id", value: "p" },
    });
    expect(res.completion.values).toEqual(["plan.md"]);
  });
});

describe("prompts", () => {
  it("lists format and summarize", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([PROMPT_NAMES.FORMAT, PROMPT_NAMES.SUMMARIZE]);
  });

  it("format mentions the doc id and edit_document", async () => {
    const res = await client.getPrompt({ name: PROMPT_NAMES.FORMAT, arguments: { doc_id: "plan.md" } });
    const content = res.messages[0]!.content as { type: string; text: string };
    expect(res.messages[0]!.role).toBe("user");
    expect(content.text).toContain("plan.md");
    expect(content.text).toContain(TOOL_NAMES.EDIT_DOCUMENT);
  });

  it("summarize mentions the doc id", async () => {
    const res = await client.getPrompt({ name: PROMPT_NAMES.SUMMARIZE, arguments: { doc_id: "report.pdf" } });
    expect((res.messages[0]!.content as { text: string }).text).toContain("report.pdf");
  });

  it("completes doc_id for prompt arguments", async () => {
    const res = await client.complete({
      ref: { type: "ref/prompt", name: PROMPT_NAMES.FORMAT },
      argument: { name: "doc_id", value: "s" },
    });
    expect(res.completion.values).toEqual(["spec.txt"]);
  });
});
