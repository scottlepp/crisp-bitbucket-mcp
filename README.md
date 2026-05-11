# @scottlepp/crisp-bitbucket-mcp

Crisp, token-efficient MCP server for Bitbucket Cloud.

Built on [`@scottlepp/mcp-toolkit`](https://github.com/scottlepp/mcp-toolkit). Companion to [`jira-mcp`](https://github.com/scottlepp/jira-mcp) and [`confluence-mcp`](https://github.com/scottlepp/confluence-mcp).

## Why

The standard Bitbucket MCP servers (and our previous fork) return raw API responses verbatim. A single `getPullRequestDiff` call can return 75 KB of unfiltered diff text, blowing past per-tool result caps and forcing the model into chunked-read fallback workflows that eat 3× the context budget.

This server fixes that. Key patterns:

1. **Handle-based diffs** — `bitbucket_diff get` returns a compact file tree + a handle. The full parsed diff is cached server-side. The agent never sees raw diff bytes. Drill in with `get_file` / `get_files(glob)` / `grep(pattern, context_lines)` — all server-side filtering.
2. **Per-extension line caps** — `.yml/.json:200`, `.md:300`, `.ts/.js/.py:500`, `.lock:50`. Sensible defaults; override per call.
3. **Default generated-file exclusions** — lock files, dist/build/vendor, generated proto/grpc. `excluded_files` reported on every diff so the agent knows what was dropped.
4. **Mutation `ack` projections** — write actions return `{id, version, state}` not full resource bodies.
5. **Field allowlists everywhere** — trim functions declare what to keep, never what to drop.
6. **Two runtime modes** — classic (consolidated MCP tools) + code-api (single tool + bundled `bitbucket-cli` binary, ~76× tool-list reduction).

## Status

Phase 2 — early development. Not yet published. See [`/Users/slepper/.claude/plans/we-are-currently-using-deep-gosling.md`](../.claude/plans/we-are-currently-using-deep-gosling.md) for the build plan.

## License

MIT
