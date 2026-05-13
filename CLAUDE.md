# CLAUDE.md

Guidance for Claude Code working inside this repo.

## What this repo is

`@scottlepper/ultra-bitbucket-mcp` — a token-efficient MCP server for Bitbucket
Cloud. The product thesis: agents should be able to review a 75 KB PR diff in
a few hundred tokens of context, by drilling into a server-side handle instead
of reading raw bytes.

## Detailed dev skill

For architecture, the manifest/trim/tool layering, how to add a new operation,
and testing conventions, see [.claude/skills/ultra-bitbucket-mcp-dev/SKILL.md](.claude/skills/ultra-bitbucket-mcp-dev/SKILL.md).
That skill auto-loads when working in this repo — but it's the canonical doc
even when read directly.

## Headlines

- **Three layers**: `src/core/` (pure logic + manifest), `src/tools/` (MCP tool
  defs), `src/index.ts` (server wiring). Most external API additions touch
  only `core/operations.ts` and one `tools/<entity>.ts`.
- **Manifest is single source of truth.** `src/core/operations.ts` declares
  every Bitbucket endpoint; the toolkit dispatcher consumes it.
- **Trims are allowlists**, never deny-lists. New API fields default to
  invisible.
- **Mutations return acks**, not full bodies (`{ok, id?, version?, state?}`).
- **The diff tool never returns raw bytes.** `get` returns a `file_tree` +
  `diff_handle`; `get_file`/`get_files`/`grep` drill in from the cache.
- **Custom handlers are the escape hatch**, not a precedent. Today: `diff`
  (text/plain + caching) and `pipeline.step_logs` (text/plain + filtering).

## Two skills, two audiences

- `.claude/skills/ultra-bitbucket-mcp-dev/SKILL.md` — for agents editing this
  repo. Not shipped.
- `skill/SKILL.md` — for agents **using** the MCP server. Shipped via npm;
  users install with `npm run install-skill`.

When you change a tool's user-facing surface (new action, renamed field,
default shift), update `skill/SKILL.md` and `README.md` in the same change.

## Build / test

```bash
npm run build       # tsc → build/
npm test            # vitest run
npm run dev         # tsc --watch
npm run inspector   # MCP Inspector against build/index.js
```

The `bin` entries (`ultra-bitbucket-mcp`, `ultra-bitbucket-cli`) point at
`build/`, so `prepare` (= `build`) must succeed before publish.

## House rules

- No new dispatch paths in `index.ts`. New ops go through the manifest.
- No raw API bodies returned from tools — always trim.
- No `any` in trims. Extend types in `src/types/`.
- Don't widen diff defaults silently — per-extension caps and excludes are
  the product. Document changes in README.

## Conventional commit style

The recent history uses short, imperative subjects (`ultra`, `add more
operations`, `fixes`, `less rigid`). Keep matching that — single-line subjects
unless the change spans layers and needs justification.
