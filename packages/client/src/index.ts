#!/usr/bin/env node
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AnthropicLlm } from "./adapters/anthropic.js";
import { OpenAiLlm } from "./adapters/openai.js";
import { ChatSession } from "./chat.js";
import { dim, formatToolCall, startRepl } from "./cli.js";
import { ConfigError, loadConfig, type Config } from "./config.js";
import { McpClient, stdioTransport } from "./mcp-client.js";
import type { LlmClient } from "./types.js";

function createLlm({ provider, apiKey, model }: Config): LlmClient {
  return provider === "openai"
    ? new OpenAiLlm(new OpenAI({ apiKey }), model)
    : new AnthropicLlm(new Anthropic({ apiKey }), model);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const mcp = await McpClient.connect(stdioTransport(config.server));

  let closing = false;
  const shutdown = async (code: number): Promise<never> => {
    if (!closing) {
      closing = true;
      await mcp.close().catch(() => {});
    }
    process.exit(code);
  };
  process.once("SIGINT", () => void shutdown(0));
  process.once("SIGTERM", () => void shutdown(0));

  const print = (text: string) => console.log(text);
  const session = new ChatSession(createLlm(config), mcp, {
    onToolCall: (call) => print(formatToolCall(call)),
    onText: (text) => print(`\n${text}\n`),
  });

  print(dim(`${config.provider} · ${config.model}`));
  await startRepl({ host: { mcp, session, print }, onInterrupt: () => void shutdown(0) });
  await shutdown(0);
}

main().catch((err) => {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
});
