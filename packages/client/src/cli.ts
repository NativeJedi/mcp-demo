import { createInterface } from "node:readline/promises";
import type { ChatSession } from "./chat.js";
import { buildUserText, complete, parseCommand, parseMentions, promptToMessages } from "./input.js";
import type { McpClient } from "./mcp-client.js";
import type { ToolCall } from "./types.js";

export const BUILTINS = ["help", "tools", "exit"] as const;

export const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;

export function formatToolCall(call: ToolCall, maxLen = 120): string {
  const args = call.invalidArgs ?? JSON.stringify(call.args);
  const line = `→ ${call.name} ${args}`.replace(/\s+/g, " ");
  return dim(line.length > maxLen ? `${line.slice(0, maxLen - 1)}…` : line);
}

export interface Host {
  mcp: Pick<McpClient, "listTools" | "listPrompts" | "getPrompt" | "listDocIds" | "readDocument">;
  session: Pick<ChatSession, "send">;
  print(text: string): void;
}

/** Handle one input line. Returns "exit" when the user asked to quit. */
export async function handleLine(line: string, host: Host): Promise<"continue" | "exit"> {
  const text = line.trim();
  if (!text) return "continue";

  const command = parseCommand(text);
  if (command) {
    const { name, arg } = command;
    if (name === "exit") return "exit";
    if (name === "help") {
      const prompts = await host.mcp.listPrompts();
      host.print(
        [
          "Mention documents with @doc_id; their contents are sent along with your message.",
          "Commands:",
          "  /help    show this help",
          "  /tools   list MCP tools",
          "  /exit    quit",
          ...prompts.map((p) => `  /${p.name} ${p.args.map((a) => `<${a.name}>`).join(" ")}  ${p.description ?? ""}`.trimEnd()),
        ].join("\n"),
      );
    } else if (name === "tools") {
      for (const t of await host.mcp.listTools()) host.print(`${t.name} — ${t.description}`);
    } else {
      const prompt = (await host.mcp.listPrompts()).find((p) => p.name === name);
      if (!prompt) {
        host.print(`Unknown command /${name}. Try /help.`);
        return "continue";
      }
      const argName = prompt.args[0]?.name;
      if (argName && !arg) {
        host.print(`Usage: /${name} <${argName}>`);
        return "continue";
      }
      const args = argName && arg ? { [argName]: arg.replace(/^@/, "") } : {};
      const messages = promptToMessages((await host.mcp.getPrompt(name, args)).messages);
      if (messages.length === 0) {
        host.print(`Prompt /${name} returned no text messages.`);
        return "continue";
      }
      await host.session.send(messages);
    }
    return "continue";
  }

  const { ids, unknown } = parseMentions(text, await host.mcp.listDocIds());
  for (const id of unknown) host.print(`Unknown document @${id} (ignored)`);
  const docs = await Promise.all(ids.map(async (id) => ({ id, content: await host.mcp.readDocument(id) })));
  await host.session.send(buildUserText(text, docs));
  return "continue";
}

export interface ReplOptions {
  host: Host;
  /** Called on Ctrl+C. */
  onInterrupt(): void;
}

/** Interactive loop; resolves when input closes or the user exits. */
export async function startRepl({ host, onInterrupt }: ReplOptions): Promise<void> {
  let docIds = await host.mcp.listDocIds();
  const commands = [...BUILTINS, ...(await host.mcp.listPrompts()).map((p) => p.name)];
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
    completer: (line: string) => complete(line, docIds, commands),
  });
  let closed = false;
  rl.on("close", () => (closed = true));
  rl.on("SIGINT", onInterrupt);

  host.print("Type /help for commands. Use @doc_id to attach a document.");
  rl.prompt();
  for await (const line of rl) {
    try {
      if ((await handleLine(line, host)) === "exit") break;
      docIds = await host.mcp.listDocIds();
    } catch (err) {
      host.print(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!closed) rl.prompt();
  }
  rl.close();
}
