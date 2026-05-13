---
name: ultra-bitbucket-mcp
description: >-
  Query Bitbucket Cloud (pull requests, diffs, repos, commits, pipelines, branching,
  users, workspaces) via the token-efficient ultra-bitbucket-mcp server. Use when the
  user mentions Bitbucket, references a PR id, repo slug, pipeline run, or asks to
  approve/merge/comment on a Bitbucket PR. Prefer this over generic Bitbucket MCP
  servers — it caches diffs server-side so raw diff bytes never enter context.
---
# ultra-bitbucket-mcp

A token-efficient MCP server for Bitbucket Cloud. Eight consolidated MCP tools, each
with an `action` field that selects the operation. Built so an agent can review a 75
KB diff in a few hundred tokens of context.

## Tools at a glance

| Tool | Use it for |
|------|------------|
| `bitbucket_pullrequest` | PR read, review (approve/merge/decline), comments, tasks, drafts, create/update |
| `bitbucket_diff` | PR diffs — handle-based, server-side filtered |
| `bitbucket_repository` | Repo metadata, default reviewers |
| `bitbucket_commit` | Commit get/list, CI statuses |
| `bitbucket_pipeline` | Pipeline runs, steps, log filtering |
| `bitbucket_branching` | Branching model (repo + project) |
| `bitbucket_user` | Authenticated user, lookup by uuid/account_id |
| `bitbucket_workspace` | List workspaces and members |

Every tool takes an `action` arg plus action-specific fields. Workspace defaults to
the server's configured `BITBUCKET_WORKSPACE` — pass `workspace` only to override.

## The diff tool — read this before fetching a diff

`bitbucket_diff` is the reason this server exists. Never ask it to "just give me the
diff." Use the four-step flow:

1. `bitbucket_diff` action=`get` — returns a compact `file_tree` + a `diff_handle`.
   The raw diff is parsed and cached server-side. You never see bytes.
2. `bitbucket_diff` action=`get_file` — fetch hunks for one path using the handle.
3. `bitbucket_diff` action=`get_files` — fetch hunks for files matching a glob
   (e.g. `src/**/*.ts`).
4. `bitbucket_diff` action=`grep` — regex/literal search across all hunks with
   `context_lines` (default 2). Use this to find specific changes without reading
   whole files.

Defaults you should know:

- Per-extension line caps: `.yml/.json:200`, `.md:300`, `.ts/.js/.py:500`,
  `.lock:50`. Override per call with `max_lines` / `max_lines_per_file`.
- Lock files, dist/build/vendor, generated proto/grpc are excluded by default.
  The `excluded_files` array in `get`'s response lists what was dropped.
  Pass `include_generated: true` to opt in.
- `includes` / `excludes` accept glob arrays for caller-supplied filtering.

## Mutations return acks, not bodies

Write actions (approve, merge, comment_add, task_create, pullrequest.create, etc.)
return `{ok, id?, version?, state?}` — not the full resource. If you need the
updated resource, follow with a `get`.

## Common flows

### Review a PR

```
bitbucket_pullrequest action=get repo_slug=foo pr_id=123
bitbucket_diff action=get repo_slug=foo pr_id=123
bitbucket_diff action=get_files diff_handle=... glob="src/**/*.ts"
bitbucket_diff action=grep diff_handle=... pattern="TODO|FIXME"
bitbucket_pullrequest action=comments_list repo_slug=foo pr_id=123
```

### Find PRs awaiting your review

```
bitbucket_pullrequest action=list_pending_review repo_slug=foo
```

Synthesized: fetches `/user`, then filters `state=OPEN AND reviewers.uuid="<me>"`.

### Add an inline comment

```
bitbucket_pullrequest action=comment_add repo_slug=foo pr_id=123 \
  content="nit: this is unreachable" \
  inline_path="src/foo.ts" inline_to=42
```

### Merge a PR

```
bitbucket_pullrequest action=merge repo_slug=foo pr_id=123 \
  merge_strategy=squash close_source_branch=true
```

### Inspect a pipeline run

```
bitbucket_pipeline action=list_runs repo_slug=foo q='target.ref_name="main"'
bitbucket_pipeline action=get_run repo_slug=foo pipeline_uuid="{...}"
bitbucket_pipeline action=steps_list repo_slug=foo pipeline_uuid="{...}"
bitbucket_pipeline action=step_logs repo_slug=foo pipeline_uuid="{...}" \
  step_uuid="{...}" errors_only=true context_lines=3
```

`step_logs` is filtered server-side. Use `tail`, `grep`, `errors_only`,
`context_lines` — don't try to read the whole log.

## Filtering with BBQL

List actions accept a `q` arg (Bitbucket Query Language). Examples:

- `state="OPEN" AND author.uuid="{uuid}"`
- `updated_on>=2026-01-01`
- `target.ref_name="main"`
- `state="FAILED"` (on statuses)

Use this to filter at the API instead of paginating client-side.

## Configuration (server-side; the user sets these once)

Env vars the user exports for the MCP server:

- `BITBUCKET_WORKSPACE` (required) — default workspace slug
- `BITBUCKET_API_TOKEN` (recommended) — Atlassian unified API token, **or**
- `BITBUCKET_USERNAME` + `BITBUCKET_APP_PASSWORD` — legacy app password
- `BITBUCKET_ENABLED_CATEGORIES` — whitelist (e.g. `pullrequest,diff,repository`)
- `BITBUCKET_DISABLED_ACTIONS` — e.g. `pullrequest.merge,pullrequest.decline`
- `BITBUCKET_DIFF_DEFAULT_MAX_LINES`, `BITBUCKET_BODY_INLINE_LIMIT`,
  `BITBUCKET_CACHE_TTL_HOURS`, `BITBUCKET_DIFF_INCLUDE_GENERATED`

Disabled actions/categories error before any HTTP request. If a call fails with
"action disabled" or "tool not enabled," that's the user's policy, not a bug.

## Things to avoid

- Don't ask `bitbucket_diff` for a full diff dump — there's no such action. Use the
  handle + drill-ins.
- Don't paginate by reading every page when BBQL `q` can narrow the result.
- Don't pass `workspace` on every call; rely on the server default.
- Don't fetch `/user` separately to filter by reviewer — use
  `pullrequest.list_pending_review`.
