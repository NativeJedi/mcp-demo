import type { Message } from "./types.js";

export interface Mentions {
  /** Known document ids, in order of first mention, deduplicated. */
  ids: string[];
  /** Mentioned ids that are not known documents. */
  unknown: string[];
}

// "@id" not glued to a preceding word char (so a@b.com is ignored); a trailing "." is not part of the id.
const MENTION = /(?<![\w.])@(\w[\w-]*(?:\.[\w-]+)*)/g;

export function parseMentions(text: string, knownIds: readonly string[]): Mentions {
  const known = new Set(knownIds);
  const ids = new Set<string>();
  const unknown = new Set<string>();
  for (const [, id] of text.matchAll(MENTION)) {
    (known.has(id!) ? ids : unknown).add(id!);
  }
  return { ids: [...ids], unknown: [...unknown] };
}

export interface ParsedCommand {
  name: string;
  arg?: string;
}

/** Parse "/command arg". Returns null for lines that are not commands. */
export function parseCommand(line: string): ParsedCommand | null {
  const m = /^\/(\S+)(?:\s+(.*\S))?\s*$/.exec(line.trim());
  if (!m) return null;
  return m[2] === undefined ? { name: m[1]! } : { name: m[1]!, arg: m[2] };
}

export function buildUserText(text: string, docs: readonly { id: string; content: string }[]): string {
  if (docs.length === 0) return text;
  const blocks = docs.map((d) => `<document id="${d.id}">\n${d.content}\n</document>`);
  return `${text}\n\n${blocks.join("\n\n")}`;
}

interface PromptMessageLike {
  role: string;
  content: { type: string; text?: string };
}

/** Convert MCP prompt messages to neutral ones, keeping only user/assistant text. */
export function promptToMessages(messages: readonly PromptMessageLike[]): Message[] {
  const out: Message[] = [];
  for (const m of messages) {
    if (m.content.type !== "text" || m.content.text === undefined) continue;
    if (m.role === "user") out.push({ role: "user", text: m.content.text });
    else if (m.role === "assistant") out.push({ role: "assistant", text: m.content.text, toolCalls: [] });
  }
  return out;
}

/** readline completer: returns [candidates, the substring they replace]. */
export function complete(
  line: string,
  docIds: readonly string[],
  commands: readonly string[],
): [string[], string] {
  const token = /\S*$/.exec(line)![0];
  const startsCommand = line.startsWith("/");

  if (token.startsWith("@")) {
    return [docIds.map((id) => `@${id}`).filter((c) => c.startsWith(token)), token];
  }
  if (startsCommand && token === line) {
    return [commands.map((c) => `/${c}`).filter((c) => c.startsWith(token)), token];
  }
  if (startsCommand) {
    // Prompt arguments are document ids: "/format rep<Tab>".
    return [docIds.filter((id) => id.startsWith(token)), token];
  }
  return [[], token];
}
