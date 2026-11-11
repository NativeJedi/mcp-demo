import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** packages/client/{src,dist} -> repo root. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export type Provider = "openai" | "anthropic";

export const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "gpt-5.5",
  anthropic: "claude-sonnet-5-5",
};

const KEY_VARS: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

export interface Config {
  provider: Provider;
  model: string;
  apiKey: string;
  server: { command: string; args: string[]; cwd: string };
}

export class ConfigError extends Error {}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  repoRoot: string = REPO_ROOT,
): Config {
  const provider = (env.LLM_PROVIDER?.trim() || "openai") as Provider;
  if (provider !== "openai" && provider !== "anthropic") {
    throw new ConfigError(`LLM_PROVIDER must be "openai" or "anthropic", got "${provider}"`);
  }
  const keyVar = KEY_VARS[provider];
  const apiKey = env[keyVar]?.trim();
  if (!apiKey) {
    throw new ConfigError(`${keyVar} is required when LLM_PROVIDER=${provider}. Set it in .env (see .env.example).`);
  }
  const command = env.MCP_SERVER_COMMAND?.trim();
  const args = env.MCP_SERVER_ARGS?.trim();
  return {
    provider,
    model: env.LLM_MODEL?.trim() || DEFAULT_MODELS[provider],
    apiKey,
    server: command
      ? { command, args: args ? args.split(/\s+/) : [], cwd: repoRoot }
      : { command: "node", args: ["packages/server/dist/index.js"], cwd: repoRoot },
  };
}
