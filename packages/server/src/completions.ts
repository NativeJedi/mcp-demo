import type { DocumentStore } from "./store.js";

/** Completion callback for `doc_id` arguments and URI-template variables. */
export const docIdCompleter =
  (store: DocumentStore) =>
  async (prefix: string): Promise<string[]> =>
    (await store.list()).filter((id) => id.startsWith(prefix));
