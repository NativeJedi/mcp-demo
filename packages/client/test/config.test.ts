import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_MODELS, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("defaults to openai and the default model", () => {
    const c = loadConfig({ OPENAI_API_KEY: "k" }, "/repo");
    expect(c).toMatchObject({ provider: "openai", model: DEFAULT_MODELS.openai, apiKey: "k" });
    expect(c.server).toEqual({ command: "node", args: ["packages/server/dist/index.js"], cwd: "/repo" });
  });
  it("requires only the selected provider's key", () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: "k" })).toThrow(/OPENAI_API_KEY/);
    expect(loadConfig({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k", LLM_MODEL: "m" }).model).toBe("m");
  });
  it("treats empty values as unset and rejects unknown providers", () => {
    expect(loadConfig({ OPENAI_API_KEY: "k", LLM_MODEL: "", MCP_SERVER_COMMAND: "" }).model).toBe(DEFAULT_MODELS.openai);
    expect(() => loadConfig({ LLM_PROVIDER: "x" })).toThrow(ConfigError);
  });
  it("parses a custom server command", () => {
    const c = loadConfig({ OPENAI_API_KEY: "k", MCP_SERVER_COMMAND: "tsx", MCP_SERVER_ARGS: "a b" });
    expect(c.server).toMatchObject({ command: "tsx", args: ["a", "b"] });
  });
});
