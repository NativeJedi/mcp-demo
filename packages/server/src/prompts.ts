import { completable, type McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { PROMPT_NAMES, TOOL_NAMES } from "@docs-mcp/shared";
import { docIdCompleter } from "./completions.js";
import type { DocumentStore } from "./store.js";

const userMessage = (text: string) => ({
  messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
});

export function registerPrompts(server: McpServer, store: DocumentStore): void {
  const argsSchema = z.object({
    doc_id: completable(z.string().describe("Id of the document"), docIdCompleter(store)),
  });

  server.registerPrompt(
    PROMPT_NAMES.FORMAT,
    {
      title: "Format document",
      description: "Rewrite a document in markdown format",
      argsSchema,
    },
    ({ doc_id }) =>
      userMessage(
        `Your goal is to reformat a document to be written with markdown syntax.\n\n` +
          `The id of the document you need to reformat is:\n<document_id>\n${doc_id}\n</document_id>\n\n` +
          `Add in headers, bullet points, tables, etc. as necessary. Feel free to add in extra text, ` +
          `but don't change the meaning of the report. Use the ${TOOL_NAMES.READ_DOC_CONTENTS} tool ` +
          `to read the document, then use the ${TOOL_NAMES.EDIT_DOCUMENT} tool to save the reformatted ` +
          `version over the original contents.`,
      ),
  );

  server.registerPrompt(
    PROMPT_NAMES.SUMMARIZE,
    {
      title: "Summarize document",
      description: "Write a concise summary of a document",
      argsSchema,
    },
    ({ doc_id }) =>
      userMessage(
        `Summarize the document with id '${doc_id}'. Use the ${TOOL_NAMES.READ_DOC_CONTENTS} tool ` +
          `to read it, then reply with a concise summary of its key points.`,
      ),
  );
}
