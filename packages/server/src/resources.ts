import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/server";
import { RESOURCE_URIS, documentUri } from "@docs-mcp/shared";
import { docIdCompleter } from "./completions.js";
import type { DocumentStore } from "./store.js";

export function registerResources(server: McpServer, store: DocumentStore): void {
  server.registerResource(
    "document-ids",
    RESOURCE_URIS.DOCUMENTS,
    {
      title: "Documents",
      description: "JSON list of all document ids",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(await store.list()),
        },
      ],
    }),
  );

  server.registerResource(
    "document",
    new ResourceTemplate(RESOURCE_URIS.DOCUMENT_TEMPLATE, {
      list: async () => ({
        resources: (await store.list()).map((id) => ({
          uri: documentUri(id),
          name: id,
          mimeType: "text/plain",
          title: id,
        })),
      }),
      complete: { doc_id: docIdCompleter(store) },
    }),
    {
      title: "Document",
      description: "Plain-text contents of a single document",
      mimeType: "text/plain",
    },
    async (uri, { doc_id }) => {
      const id = decodeURIComponent(String(doc_id));
      const content = await store.get(id);
      if (content === undefined) throw new Error(`Document '${id}' not found`);
      return { contents: [{ uri: uri.href, mimeType: "text/plain", text: content }] };
    },
  );
}
