import type { DocumentId } from "@docs-mcp/shared";

export interface DocumentStore {
  list(): Promise<DocumentId[]>;
  get(id: DocumentId): Promise<string | undefined>;
  set(id: DocumentId, content: string): Promise<void>;
}

export const SEED_DOCUMENTS: Readonly<Record<DocumentId, string>> = {
  "deposition.md": "This deposition covers the testimony of Angela Smith, P.E.",
  "report.pdf": "The report details the state of a 20m condenser tower.",
  "financials.docx": "These financials outline the project's budget and expenditures.",
  "outlook.pdf": "This document presents the projected future performance of the system.",
  "plan.md": "The plan outlines the steps for the project's implementation.",
  "spec.txt": "These specifications define the technical requirements for the equipment.",
};

export class InMemoryDocumentStore implements DocumentStore {
  private readonly docs: Map<DocumentId, string>;

  constructor(seed: Readonly<Record<DocumentId, string>> = SEED_DOCUMENTS) {
    this.docs = new Map(Object.entries(seed));
  }

  async list(): Promise<DocumentId[]> {
    return [...this.docs.keys()];
  }

  async get(id: DocumentId): Promise<string | undefined> {
    return this.docs.get(id);
  }

  async set(id: DocumentId, content: string): Promise<void> {
    this.docs.set(id, content);
  }
}
