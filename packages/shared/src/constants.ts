export const TOOL_NAMES = {
  READ_DOC_CONTENTS: "read_doc_contents",
  EDIT_DOCUMENT: "edit_document",
} as const;

export const PROMPT_NAMES = {
  FORMAT: "format",
  SUMMARIZE: "summarize",
} as const;

export const RESOURCE_URIS = {
  /** Static resource: JSON list of all document ids. */
  DOCUMENTS: "docs://documents",
  /** Resource template: plain-text contents of one document. */
  DOCUMENT_TEMPLATE: "docs://documents/{doc_id}",
} as const;

/** Build the concrete URI for a single document. */
export const documentUri = (id: string): string =>
  `docs://documents/${encodeURIComponent(id)}`;
