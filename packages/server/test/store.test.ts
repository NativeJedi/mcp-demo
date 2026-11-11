import { describe, expect, it } from "vitest";
import { InMemoryDocumentStore, SEED_DOCUMENTS } from "../src/store.js";

describe("InMemoryDocumentStore", () => {
  it("lists the seeded documents", async () => {
    const store = new InMemoryDocumentStore();
    expect(await store.list()).toEqual(Object.keys(SEED_DOCUMENTS));
    expect(await store.list()).toHaveLength(6);
  });

  it("gets a document and returns undefined for a missing one", async () => {
    const store = new InMemoryDocumentStore();
    expect(await store.get("spec.txt")).toBe(SEED_DOCUMENTS["spec.txt"]);
    expect(await store.get("nope.txt")).toBeUndefined();
  });

  it("sets new and existing documents", async () => {
    const store = new InMemoryDocumentStore();
    await store.set("plan.md", "# Plan");
    await store.set("new.md", "hello");
    expect(await store.get("plan.md")).toBe("# Plan");
    expect(await store.get("new.md")).toBe("hello");
    expect(await store.list()).toContain("new.md");
  });

  it("does not mutate the seed between instances", async () => {
    const a = new InMemoryDocumentStore();
    await a.set("plan.md", "changed");
    expect(await new InMemoryDocumentStore().get("plan.md")).toBe(SEED_DOCUMENTS["plan.md"]);
  });
});
