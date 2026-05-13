---
name: ultra-bitbucket-mcp-dev
description: >-
  Internal developer guidance for working on the ultra-bitbucket-mcp codebase
  itself — architecture, the operations/trim/tool layering, how to add a new
  Bitbucket operation, testing patterns, and the diff cache. Use when editing
  files under this repo (src/, build/, scripts/, skill/). Not for end-users
  calling the MCP — that's the shipped `ultra-bitbucket-mcp` skill.
---
# ultra-bitbucket-mcp — dev skill

You are working **on** the `@scottlepp/ultra-bitbucket-mcp` server, not
**with** it. This skill orients you to the codebase and its conventions.

## Three layers

The repo splits cleanly into three layers. Edits almost always belong in
exactly one of them — keep that boundary clean.

```
src/
├── core/               ← Layer 1: pure logic. No I/O, no MCP.
│   ├── operations.ts       Bitbucket REST manifest (paths, params, verb, trim key)
│   ├── trim.ts             Field-allowlist projections of API responses
│   ├── trim-registry.ts    Maps trim string-keys → trim functions
│   └── diff/               Diff parser, cache, glob excludes, drill-ins
├── tools/              ← Layer 2: MCP tool defs.
│   ├── pullrequest.ts      ConsolidatedToolDef for bitbucket_pullrequest
│   ├── repository.ts       ...
│   └── diff.ts             CustomToolDef (escape hatch, see below)
└── index.ts            ← Layer 3: server wiring, dispatch, env.
```

Most external Bitbucket API additions touch only Layer 1 (`operations.ts` +
maybe a new trim) and Layer 2 (a new action in the matching tool file).

## The manifest pattern

`src/core/operations.ts` is the single source of truth for every Bitbucket
REST endpoint we expose. Each entry is an `op({...})` with:

- `name` — dotted id (`pullrequest.merge`), referenced from tool action
- `verb`, `pathTemplate` — HTTP method + path template (`{workspace}` etc.)
- `params` — array of `{name, role: "path" | "query" | "body", required?, description?}`
- `trim` — string key into `trimRegistry` (compile-time-checked at module load)

The dispatcher (`@scottlepp/mcp-toolkit`'s `invokeOperation`) consumes the
manifest, walks `params`, builds the URL + body, calls the HTTP client,
runs the trim, and returns the projection. Tools never call `client.get`
directly except in the diff/pipeline custom handlers.

## Adding a new operation

1. **Manifest entry** in `src/core/operations.ts`. Pick the trim key from
   `trim-registry.ts` (or add a new one — see below). The order doesn't
   matter for behavior, but keep sections grouped.
2. **Action wiring** in the matching `src/tools/<entity>.ts`. Add a Zod
   `Schema` and an `actions.<name>` entry pointing at `operation:
   "<dotted-name>"`.
3. **Schema shape**: use the shared `prTargetFields` / `positiveInt` helpers.
   If the Bitbucket body shape is nested (`{content: {raw: ...}}`), keep
   the schema's caller-facing fields flat and reshape via `.transform(...)`
   — see `CommentAddSchema` in [src/tools/pullrequest.ts](src/tools/pullrequest.ts)
   for the canonical example.
4. **Test** in the tool's `.test.ts`. Most tests mock the HTTP client and
   assert the URL + body that the dispatcher emits.

## Adding a new trim

Trims live in `src/core/trim.ts` and are registered in `trim-registry.ts`.

- Trim functions accept the raw Bitbucket response and return a compact
  object. **Field allowlists only** — declare what to KEEP, never what to
  drop. New API fields then default to invisible (safe), not visible.
- For list responses, project `values[]` through the item trim and keep
  pagination metadata.
- Write actions use `ack: mutationAck` — `{ok, id?, version?, state?, ...}`.
  Don't invent per-mutation trims unless there's a strong reason.

The module-load check in `operations.ts` will throw if a manifest entry
references a trim key not in the registry. That fires before any test runs.

## The diff tool is special

`src/tools/diff.ts` does NOT use the manifest. Reason: `get` fetches
text/plain (the diff) **and** JSON (PR metadata) in parallel, parses,
and caches; `get_file`/`get_files`/`grep` don't hit the API at all —
they read the parsed-diff cache. The manifest dispatcher can't model that.

The diff is the entire reason this server exists. Don't regress its
boundaries:

- Raw diff bytes **must not** reach the agent. `get` returns `file_tree`
  + a `diff_handle`; drill-ins read from cache.
- Default per-extension line caps live in [src/core/diff/drill-ins.ts](src/core/diff/drill-ins.ts).
  Changing them changes token economics for every user — bring receipts.
- Default exclude globs live in [src/core/diff/excludes.ts](src/core/diff/excludes.ts).
  When you add an exclude, also add a test in `excludes.test.ts`.

The cache is keyed by `{workspace, repo_slug, pr_id, head_sha}` so a force-
push invalidates naturally. TTL is `BITBUCKET_CACHE_TTL_HOURS` (default 24).

## Pipeline log filter — also a custom handler

`pipeline.step_logs` returns `text/plain` (not JSON) and supports server-
side `tail`, `grep`, `errors_only`, `context_lines`. The logic is in
[src/core/pipeline/log-filter.ts](src/core/pipeline/log-filter.ts) — keep
filtering pure (string in, string out) and let the tool handler do I/O.

## Tool-mode + env config

`src/config.ts` parses env. Two modes via `BITBUCKET_TOOL_MODE`:

- `classic` (default) — what's wired today. Consolidated tools.
- `code-api` — planned single-tool + bundled `bitbucket-cli`. Currently
  warns and falls back to classic.

`BITBUCKET_ENABLED_CATEGORIES` (whitelist) and `BITBUCKET_DISABLED_ACTIONS`
flow through the dispatcher's `invokeOptions.disabledActions`. Disabled
actions error **before** any HTTP call — tests assert this.

## Testing

`vitest` with `vitest run` (CI) / `vitest` (watch). Conventions:

- Tool tests mock the HTTP client and assert request shape, not response
  bodies. Trims have their own tests with realistic fixtures.
- The diff parser has fixture-driven tests in `parser.test.ts` — when
  adding a parser branch, add a fixture, not just an assertion.
- `operations.test.ts` is a smoke test that every manifest entry has a
  resolvable trim. Don't bypass it.

## Two skills, two audiences

This repo ships **two** skill files. Don't confuse them:

- `.claude/skills/ultra-bitbucket-mcp-dev/SKILL.md` (this file) — for
  agents editing the codebase. Not shipped to users.
- `skill/SKILL.md` — for agents **using** the MCP server. Shipped via
  npm, installed by users with `npm run install-skill`.

When you change a tool's surface (new action, renamed field, default
shift), update `skill/SKILL.md` too. The dev skill stays codebase-focused.

## What to avoid

- Don't add new dispatch paths in `index.ts`. New ops go through the
  manifest. Custom tools (`diff`, log-filter) are the documented escape
  hatch, not a precedent.
- Don't return raw API bodies from tools. Everything goes through a trim.
- Don't introduce `any` in trims — the response types in `src/types/`
  exist for a reason; extend them.
- Don't widen the diff's defaults silently. Per-extension caps and the
  excluded-files list are the product. Changes need a README note.
- Don't skip `prepare`/`build` when shipping — `bin/` points at
  `build/index.js`. If TS hasn't compiled, `npx ultra-bitbucket-mcp`
  errors with "Cannot find module."
