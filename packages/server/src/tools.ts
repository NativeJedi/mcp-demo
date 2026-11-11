import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { TOOL_NAMES } from "@docs-mcp/shared";
import type { DocumentStore } from "./store.js";

const text = (t: string) => [{ type: "text" as const, text: t }];
const errorResult = (message: string) => ({ isError: true as const, content: text(message) });

export function registerTools(server: McpServer, store: DocumentStore): void {
  server.registerTool(
    TOOL_NAMES.READ_DOC_CONTENTS,
    {
      title: "Read document",
      description: "Read the contents of a document and return it as a string.",
      inputSchema: z.object({
        doc_id: z.string().describe("Id of the document to read, e.g. 'report.pdf'"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ doc_id }) => {
      const content = await store.get(doc_id);
      if (content === undefined) return errorResult(`Document '${doc_id}' not found`);
      return { content: text(content) };
    },
  );

  server.registerTool(
    TOOL_NAMES.EDIT_DOCUMENT,
    {
      title: "Edit document",
      description: "Edit a document by replacing an exact string with a new string.",
      inputSchema: z.object({
        doc_id: z.string().describe("Id of the document to edit"),
        old_str: z
          .string()
          .describe("Text to replace. Must match exactly, including whitespace"),
        new_str: z.string().describe("Text to insert in place of old_str"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ doc_id, old_str, new_str }) => {
      const content = await store.get(doc_id);
      if (content === undefined) return errorResult(`Document '${doc_id}' not found`);
      if (!content.includes(old_str)) {
        return errorResult(`old_str not found in document '${doc_id}'`);
      }
      // Function replacer so '$' sequences in new_str are taken literally.
      await store.set(doc_id, content.replace(old_str, () => new_str));
      return { content: text(`Edited document '${doc_id}'`) };
    },
  );
}
