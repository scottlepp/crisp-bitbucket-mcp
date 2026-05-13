# ultra-bitbucket-mcp

Token-efficient MCP server for Bitbucket Cloud. Eight consolidated tools, a
handle-based diff workflow, and per-extension line caps that let an agent
review a 75 KB PR in a few hundred tokens of context.

Built on [`@scottlepp/mcp-toolkit`](https://github.com/scottlepp/mcp-toolkit).

## Why

Standard Bitbucket MCP servers return raw API responses verbatim. A single
`getPullRequestDiff` can return 75 KB of unfiltered diff text, blowing past
per-tool result caps and forcing chunked-read fallbacks that eat 3× the
context budget.

This server fixes that:

1. **Handle-based diffs** — `bitbucket_diff get` returns a compact file tree
   + a handle. The full parsed diff is cached server-side. The agent never
   sees raw diff bytes. Drill in with `get_file` / `get_files(glob)` /
   `grep(pattern, context_lines)` — all server-side filtering.
2. **Per-extension line caps** — `.yml/.json: 200`, `.md: 300`,
   `.ts/.js/.py: 500`, `.lock: 50`. Sensible defaults; override per call.
3. **Default generated-file exclusions** — lock files, dist/build/vendor,
   generated proto/grpc. `excluded_files` reported on every diff so the
   agent knows what was dropped.
4. **Mutation `ack` projections** — write actions return
   `{ok, id?, version?, state?}` not full resource bodies.
5. **Field allowlists everywhere** — trim functions declare what to keep,
   never what to drop. New API fields default to invisible.
6. **Server-side log filtering** — `pipeline.step_logs` supports `tail`,
   `grep`, `errors_only`, `context_lines`. No need to stream whole logs.

## Install

```bash
npm install -g @scottlepp/ultra-bitbucket-mcp
```

Or run on-demand via `npx @scottlepp/ultra-bitbucket-mcp`.

## Configure

Set credentials and a default workspace in the environment Claude Code (or
your MCP client) launches the server from:

```bash
export BITBUCKET_WORKSPACE=my-team           # required
export BITBUCKET_API_TOKEN=…                 # recommended (Atlassian unified token)
# OR (legacy)
export BITBUCKET_USERNAME=…
export BITBUCKET_APP_PASSWORD=…
```

If both `BITBUCKET_API_TOKEN` and the app-password pair are set, the API
token wins and a warning is printed to stderr.

### Optional knobs

| Var | Default | Purpose |
|-----|---------|---------|
| `BITBUCKET_URL` | `https://api.bitbucket.org/2.0` | Override API base (staging mirrors, fixtures) |
| `BITBUCKET_TOOL_MODE` | `classic` | `classic` (default) or `code-api` (planned) |
| `BITBUCKET_ENABLED_CATEGORIES` | _all_ | Whitelist: `pullrequest,diff,repository,…` |
| `BITBUCKET_DISABLED_ACTIONS` | _none_ | Block specific actions: `pullrequest.merge,pullrequest.decline` |
| `BITBUCKET_DIFF_DEFAULT_MAX_LINES` | `500` | Fallback cap when no per-extension default matches |
| `BITBUCKET_DIFF_INCLUDE_GENERATED` | `false` | Bypass default lock/build/vendor excludes |
| `BITBUCKET_BODY_INLINE_LIMIT` | `4000` | Char cap before bodies are summarized |
| `BITBUCKET_CACHE_TTL_HOURS` | `24` | Diff cache TTL |
| `BITBUCKET_DISABLE_TRIM` | `false` | Escape hatch — return raw API bodies |

A `.env` (or `.env.local` for overrides) in the launch cwd is loaded
automatically.

### Wire it into Claude Code

`~/.claude/settings.json` (or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "npx",
      "args": ["-y", "@scottlepp/ultra-bitbucket-mcp"],
      "env": {
        "BITBUCKET_WORKSPACE": "my-team",
        "BITBUCKET_API_TOKEN": "…"
      }
    }
  }
}
```

### Install the user-facing skill (recommended)

Ships with a Claude Code skill that teaches the agent the efficient call
patterns (handle-based diffs, BBQL `q` filters, the `list_pending_review`
shortcut). Install it into `~/.claude/skills/`:

```bash
npm exec --package=@scottlepp/ultra-bitbucket-mcp -- install-skill
# or, from a checkout / global install:
npm run install-skill
```

Override the target with `--dir=<path>` or `CLAUDE_SKILLS_DIR=<path>`.
Restart Claude Code afterward so it picks up the new skill.

## Tools

Eight consolidated MCP tools. Each takes an `action` field plus action-
specific args. `workspace` defaults to `BITBUCKET_WORKSPACE` — pass it
explicitly only to override per call.

| Tool | Actions |
|------|---------|
| `bitbucket_pullrequest` | `get`, `list`, `list_pending_review`, `approve`, `unapprove`, `merge`, `decline`, `create`, `update`, `convert_to_draft`, `publish_draft`, `activity`, `commits`, `statuses`, `comments_list`, `comment_get`, `comment_add`, `comment_update`, `comment_delete`, `comment_resolve`, `comment_reopen`, `tasks_list`, `task_get`, `task_create`, `task_update`, `task_delete` |
| `bitbucket_diff` | `get`, `get_file`, `get_files`, `grep` |
| `bitbucket_repository` | `get`, `list`, `default_reviewers`, `effective_default_reviewers` |
| `bitbucket_commit` | `get`, `list`, `statuses` |
| `bitbucket_pipeline` | `list_runs`, `get_run`, `run`, `stop`, `steps_list`, `step_get`, `step_logs` |
| `bitbucket_branching` | `repo_model`, `repo_settings`, `repo_settings_update`, `repo_effective`, `project_model`, `project_settings`, `project_settings_update` |
| `bitbucket_user` | `me`, `get` |
| `bitbucket_workspace` | `list`, `get`, `members` |

## Usage examples

### Review a PR end-to-end

```jsonc
// 1. Get the trimmed PR summary
bitbucket_pullrequest { action: "get", repo_slug: "foo", pr_id: 123 }

// 2. Get the diff handle + file tree (no raw bytes)
bitbucket_diff { action: "get", repo_slug: "foo", pr_id: 123 }
// → { diff_handle, head_sha, base_sha, file_tree: [...], excluded_files: [...] }

// 3. Drill into matching files
bitbucket_diff { action: "get_files", diff_handle, glob: "src/**/*.ts" }

// 4. Or grep for specific changes with context
bitbucket_diff { action: "grep", diff_handle, pattern: "TODO|FIXME", context_lines: 2 }

// 5. Read review comments
bitbucket_pullrequest { action: "comments_list", repo_slug: "foo", pr_id: 123 }
```

### Find PRs awaiting your review

```jsonc
bitbucket_pullrequest { action: "list_pending_review", repo_slug: "foo" }
```

Synthesized server-side: fetches `/user` for your uuid, then runs
`pullrequest.list` with `state="OPEN" AND reviewers.uuid="<me>"`.

### Add an inline comment

```jsonc
bitbucket_pullrequest {
  action: "comment_add",
  repo_slug: "foo", pr_id: 123,
  content: "nit: this is unreachable",
  inline_path: "src/foo.ts", inline_to: 42
}
```

### Merge with options

```jsonc
bitbucket_pullrequest {
  action: "merge",
  repo_slug: "foo", pr_id: 123,
  merge_strategy: "squash",
  close_source_branch: true
}
```

### Filter pipeline logs server-side

```jsonc
bitbucket_pipeline {
  action: "step_logs",
  repo_slug: "foo",
  pipeline_uuid: "{...}",
  step_uuid: "{...}",
  errors_only: true,
  context_lines: 3
}
```

### BBQL filtering

List actions accept a `q` Bitbucket Query Language string. Examples:

- `state="OPEN" AND author.uuid="{uuid}"`
- `updated_on>=2026-01-01`
- `target.ref_name="main"` (on pipeline runs)
- `state="FAILED"` (on commit statuses)

## Tool gating

Two policy knobs limit what the server exposes:

- `BITBUCKET_ENABLED_CATEGORIES=pullrequest,diff,repository` — whitelist of
  consolidated-tool categories. Empty = all on.
- `BITBUCKET_DISABLED_ACTIONS=pullrequest.merge,pullrequest.decline` — block
  individual operations. Disabled actions error *before* any HTTP call.

Both are enforced in `tools/list` (disabled tools don't appear) and in the
dispatcher (disabled actions reject).

## Development

```bash
npm install
npm run build       # tsc → build/
npm test            # vitest run
npm run dev         # tsc --watch
npm run inspector   # MCP Inspector against build/index.js
```

See [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) and
[.claude/skills/ultra-bitbucket-mcp-dev/SKILL.md](.claude/skills/ultra-bitbucket-mcp-dev/SKILL.md)
for codebase conventions (the layered architecture, manifest pattern,
trim allowlists, custom-handler escape hatches).

## License

MIT
