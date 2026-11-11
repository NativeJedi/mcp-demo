# docs-mcp

A Node.js/TypeScript port of the "document MCP server" from Anthropic's *Introduction to MCP* course, built on the official MCP TypeScript SDK **v2** (`@modelcontextprotocol/server` 2.x) and zod v4. It's an npm-workspaces monorepo; a client package can be added under `packages/` later.

## Layout

```
packages/
  shared/   @docs-mcp/shared  – tool/prompt names, resource URIs, shared types (no runtime deps)
  server/   @docs-mcp/server  – DocumentStore, createServer(store), stdio entry point, tests
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
