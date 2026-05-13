# AGENTS.md

Guidance for AI coding agents working in this repo. Mirrors
[CLAUDE.md](CLAUDE.md) for tools that follow the
[agents.md](https://agents.md) convention.

## What this repo is

`@scottlepp/ultra-bitbucket-mcp` — a token-efficient MCP server for Bitbucket
Cloud. Built so an agent can review a 75 KB PR diff in a few hundred tokens
of context, via server-side diff caching + handle-based drill-ins.

## Where to look first

- **Architecture, conventions, how to add an operation**:
  [.claude/skills/ultra-bitbucket-mcp-dev/SKILL.md](.claude/skills/ultra-bitbucket-mcp-dev/SKILL.md)
- **Tool-surface reference** (what the MCP exposes):
  [skill/SKILL.md](skill/SKILL.md) and [README.md](README.md)

## Three layers

```
src/
├── core/      pure logic — operations manifest, trims, diff parser/cache
├── tools/     MCP tool defs — one consolidated tool per Bitbucket entity
└── index.ts   server wiring, env config, dispatch
```

Most additions touch one entry in `src/core/operations.ts` plus one action in
the matching `src/tools/<entity>.ts`.

## Non-negotiables

- **Manifest is the single source of truth.** All Bitbucket REST endpoints
  declared in `src/core/operations.ts`. The dispatcher walks it.
- **Trims are allowlists.** Declare fields to KEEP. New API fields default to
  invisible (safe).
- **Diff tool never leaks raw bytes.** `get` → file tree + handle; drill-ins
  read from server-side cache. Don't add a `get_raw` action.
- **Mutations return acks**, not full resources.
- **Custom handlers are the documented escape hatch** (currently: `diff`,
  `pipeline.step_logs`) — don't introduce more without justification.

## Two skills, two audiences

- `.claude/skills/ultra-bitbucket-mcp-dev/SKILL.md` — for agents editing this
  repo. Not shipped.
- `skill/SKILL.md` — for agents **using** the MCP server. Shipped via npm;
  users install with `npm run install-skill`.

When you change tool surface, update `skill/SKILL.md` and `README.md` in the
same change.

## Build / test

```bash
npm run build       # tsc → build/
npm test            # vitest run
npm run inspector   # MCP Inspector against build/index.js
```

`bin/` points at `build/`, so `prepare` must succeed before publish.
