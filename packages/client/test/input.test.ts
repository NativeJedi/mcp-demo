import { describe, expect, it } from "vitest";
import { buildUserText, complete, parseCommand, parseMentions, promptToMessages } from "../src/input.js";

const DOCS = ["report.pdf", "plan.md", "spec.txt"];

describe("parseMentions", () => {
  it("finds known ids once, in order", () => {
    expect(parseMentions("compare @plan.md with @report.pdf and @plan.md", DOCS)).toEqual({
      ids: ["plan.md", "report.pdf"],
      unknown: [],
    });
  });
  it("reports unknown ids", () => {
    expect(parseMentions("see @nope.md and @plan.md", DOCS)).toEqual({ ids: ["plan.md"], unknown: ["nope.md"] });
  });
  it("ignores emails", () => {
    expect(parseMentions("mail a@b.com or first.last@plan.md", DOCS)).toEqual({ ids: [], unknown: [] });
  });
  it("drops trailing punctuation", () => {
    expect(parseMentions("read @report.pdf. Then (@plan.md), ok?", DOCS).ids).toEqual(["report.pdf", "plan.md"]);
  });
  it("handles mention at start and a lone @", () => {
    expect(parseMentions("@spec.txt @ hi", DOCS)).toEqual({ ids: ["spec.txt"], unknown: [] });
  });
});

describe("parseCommand", () => {
  it("parses name and arg", () => {
    expect(parseCommand("/format report.pdf")).toEqual({ name: "format", arg: "report.pdf" });
    expect(parseCommand("  /help  ")).toEqual({ name: "help" });
  });
  it("rejects non-commands", () => {
    expect(parseCommand("hello /format")).toBeNull();
    expect(parseCommand("/ nothing")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
});

describe("buildUserText / promptToMessages", () => {
  it("wraps documents", () => {
    expect(buildUserText("hi", [{ id: "a.md", content: "A" }])).toBe('hi\n\n<document id="a.md">\nA\n</document>');
    expect(buildUserText("hi", [])).toBe("hi");
  });
  it("keeps only user/assistant text", () => {
    expect(
      promptToMessages([
        { role: "user", content: { type: "text", text: "q" } },
        { role: "assistant", content: { type: "text", text: "a" } },
        { role: "user", content: { type: "image" } },
      ]),
    ).toEqual([
      { role: "user", text: "q" },
      { role: "assistant", text: "a", toolCalls: [] },
    ]);
  });
});

describe("complete", () => {
  const cmds = ["help", "tools", "exit", "format", "summarize"];
  it("completes doc ids after @", () => {
    expect(complete("read @re", DOCS, cmds)).toEqual([["@report.pdf"], "@re"]);
    expect(complete("@", DOCS, cmds)[0]).toHaveLength(3);
  });
  it("completes commands after /", () => {
    expect(complete("/f", DOCS, cmds)).toEqual([["/format"], "/f"]);
    expect(complete("/", DOCS, cmds)[0]).toHaveLength(5);
  });
  it("completes doc ids as a command argument", () => {
    expect(complete("/format sp", DOCS, cmds)).toEqual([["spec.txt"], "sp"]);
  });
  it("offers nothing for plain text, emails, or mid-line slashes", () => {
    expect(complete("hello wor", DOCS, cmds)[0]).toEqual([]);
    expect(complete("a@b", DOCS, cmds)[0]).toEqual([]);
    expect(complete("see /fo", DOCS, cmds)[0]).toEqual([]);
  });
  it("returns no hits for unknown prefixes", () => {
    expect(complete("@zzz", DOCS, cmds)).toEqual([[], "@zzz"]);
  });
});
