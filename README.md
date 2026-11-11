# docs-mcp

A Node.js/TypeScript port of the "document MCP server" from Anthropic's *Introduction to MCP* course, built on the official MCP TypeScript SDK **v2** (`@modelcontextprotocol/server` 2.x) and zod v4. It's an npm-workspaces monorepo; the client lives in `packages/client`.

## Layout

```
packages/
  shared/   @docs-mcp/shared  – tool/prompt names, resource URIs, shared types (no runtime deps)
  server/   @docs-mcp/server  – DocumentStore, createServer(store), stdio entry point, tests
  client/   @docs-mcp/client  – CLI chat host (OpenAI / Anthropic adapters, ChatSession, MCP client)
tsconfig.base.json            – strict, ESM, NodeNext
tsconfig.json                 – project references only
```

## What the server exposes

| Kind | Name / URI | Notes |
| --- | --- | --- |
| Tool | `read_doc_contents(doc_id)` | read-only; `isError` if the doc is missing |
| Tool | `edit_document(doc_id, old_str, new_str)` | exact find/replace; `isError` if doc or `old_str` is missing |
| Resource | `docs://documents` | JSON list of doc ids |
| Resource template | `docs://documents/{doc_id}` | `text/plain`, with listing and `doc_id` completion |
| Prompt | `format(doc_id)` | rewrite the doc in markdown and save via `edit_document` |
| Prompt | `summarize(doc_id)` | concise summary |

Documents are held in memory (seeded with 6 samples), so edits last for the life of the process.

## Setup

Requires Node 24 and npm.

```bash
npm install
npm run build   # tsc -b
npm test        # vitest run
```

`npm run dev:server` runs the server from source with `tsx`.

## MCP Inspector

```bash
npm run inspect
```

This builds and launches the Inspector against `packages/server/dist/index.js` over stdio.

## Claude Code

```bash
claude mcp add docs -- node /Users/ruslan_lukianenko/Projects/mcp-demo/packages/server/dist/index.js
```

## Claude Desktop

Add to `claude_desktop_config.json` (use your absolute path):

```json
{
  "mcpServers": {
    "docs": {
      "command": "node",
      "args": ["/Users/ruslan_lukianenko/Projects/mcp-demo/packages/server/dist/index.js"]
    }
  }
}
```

Run `npm run build` first. The server logs to stderr only; stdout is reserved for the protocol.

## Client (`@docs-mcp/client`)

A CLI chat host for the server: it spawns the server over stdio, lets an LLM call its tools, and implements the tool-use loop itself (no LLM frameworks). Providers: OpenAI (Responses API) and Anthropic (Messages API).

```
CLI (readline, @mentions, /commands)
  └─ ChatSession (provider-neutral history, tool-use loop, 10-iteration cap)
       ├─ LlmClient adapter ── OpenAiLlm | AnthropicLlm ──> provider API
       └─ McpClient (stdio) ───────────────────────────────> docs MCP server
```

### Setup

```bash
npm install && npm run build
cp .env.example .env   # then fill in the key for your provider
npm run dev:client
```

| Variable | Default | Notes |
| --- | --- | --- |
| `LLM_PROVIDER` | `openai` | `openai` or `anthropic` |
| `LLM_MODEL` | `gpt-5.5` / `claude-sonnet-5-5` | per-provider default |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | – | only the selected provider's key is required |
| `MCP_SERVER_COMMAND` / `MCP_SERVER_ARGS` | `node packages/server/dist/index.js` | args are whitespace-separated; the server runs with the repo root as its working directory |

Env is loaded with `node --env-file=.env` (no dotenv). The server must be built first.

### Usage

```
> summarize @report.pdf             # @doc_id contents are attached as <document id="...">
> /format plan.md                   # run an MCP prompt, then let the model use the tools
> /tools                            # list MCP tools
> /help                             # built-ins and prompts
> /exit                             # or Ctrl+C
```

Tab completes doc ids after `@` (and after a `/command`), and command names after `/`. Tool calls are shown as one dim line.

### Tests

`npm test` builds, then runs vitest. No test calls a real LLM API: adapters are tested through their pure conversion functions (`toProviderTools`, `toProviderMessages`, `fromProviderResponse`) and `ChatSession` through a scripted fake `LlmClient`. Integration tests connect the real server over an in-memory transport; one e2e test spawns the built server over stdio.
