// Bitbucket Cloud REST 2.0 operation manifest.
//
// Single source of truth. Read by:
//   - Layer 2 (classic MCP tools): consolidated tool dispatchers call
//     `invokeOperation(operations, client, ...)` against entries here.
//   - Layer 3 (code-api): the bundled `bitbucket-cli` reads this for
//     argv validation, --help output, and CLI → bridge dispatch.
//
// Phase 1 scope: pullrequest.get/list + repository.get/list. Phase 3
// extends this to the full surface.

import type { Manifest, Operation } from "@scottlepp/mcp-toolkit/manifest";
import type { TrimKey } from "./trim-registry.js";

// Helper to keep operation declarations terse while still type-checking
// the trim key against the local registry.
function op<T extends Omit<Operation, "trim"> & { trim?: TrimKey }>(
  o: T,
): Operation {
  return o as Operation;
}

export const operations: Manifest = [
  // ====================================================================
  // PULL REQUESTS
  // ====================================================================

  op({
    name: "pullrequest.get",
    description: "Fetch one pull request by id within a repository",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}",
    params: [
      { name: "workspace", role: "path", required: true, description: "Workspace slug" },
      { name: "repo_slug", role: "path", required: true, description: "Repository slug" },
      { name: "pr_id", role: "path", required: true, description: "Pull request id (number)" },
      { name: "fields", role: "query", description: "Bitbucket fields= projection (optional)" },
    ],
    trim: "pullrequest",
  }),

  op({
    name: "pullrequest.list",
    description: "List pull requests in a repository",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "state", role: "query", description: "OPEN | MERGED | DECLINED | SUPERSEDED (Bitbucket accepts a comma-separated list)" },
      { name: "q", role: "query", description: "BBQL filter (Bitbucket Query Language). E.g. `state=\"OPEN\" AND author.uuid=\"{...}\"`" },
      { name: "sort", role: "query", description: "Field to sort by (e.g. -updated_on)" },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query", description: "Items per page (max 50)" },
    ],
    trim: "pullrequestList",
  }),

  // --- PR review write actions ---------------------------------------

  op({
    name: "pullrequest.approve",
    description: "Approve a pull request as the authenticated user",
    verb: "POST",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/approve",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
    ],
    trim: "ack",
  }),

  op({
    name: "pullrequest.unapprove",
    description: "Withdraw approval on a pull request",
    verb: "DELETE",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/approve",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
    ],
    trim: "ack",
  }),

  op({
    name: "pullrequest.merge",
    description: "Merge a pull request. Body params control merge strategy and source-branch handling.",
    verb: "POST",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/merge",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "type", role: "body", description: "Body type marker; default 'pullrequest_merge_parameters'" },
      { name: "message", role: "body", description: "Override merge commit message" },
      { name: "close_source_branch", role: "body", description: "Delete the source branch after merge" },
      { name: "merge_strategy", role: "body", description: "merge_commit | squash | fast_forward" },
    ],
    trim: "ack",
  }),

  op({
    name: "pullrequest.decline",
    description: "Decline (close without merging) a pull request",
    verb: "POST",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/decline",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
    ],
    trim: "ack",
  }),

  // --- PR comments ---------------------------------------------------

  op({
    name: "pullrequest.comments_list",
    description: "List comments on a pull request (top-level + replies, inline + general)",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/comments",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "q", role: "query", description: "BBQL filter (e.g. resolution.user.uuid=...)" },
      { name: "sort", role: "query" },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query", description: "Items per page (max 100; default 25)" },
    ],
    trim: "commentList",
  }),

  op({
    name: "pullrequest.comment_add",
    description: "Add a comment to a pull request. Top-level by default; pass `parent` for replies, `inline` for line-anchored comments.",
    verb: "POST",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/comments",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "content", role: "body", required: true, description: "{ raw: <markdown body> }" },
      { name: "parent", role: "body", description: "{ id: <comment_id> } — for replies" },
      { name: "inline", role: "body", description: "{ path, to?, from? } — for line-anchored comments" },
    ],
    trim: "ack",
  }),

  op({
    name: "pullrequest.comment_update",
    description: "Edit an existing comment",
    verb: "PUT",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/comments/{comment_id}",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "comment_id", role: "path", required: true },
      { name: "content", role: "body", required: true, description: "{ raw: <markdown body> }" },
    ],
    trim: "ack",
  }),

  op({
    name: "pullrequest.comment_delete",
    description: "Delete a comment (Bitbucket leaves a tombstone)",
    verb: "DELETE",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/comments/{comment_id}",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "comment_id", role: "path", required: true },
    ],
    trim: "ack",
  }),

  // ====================================================================
  // REPOSITORY
  // ====================================================================

  op({
    name: "repository.get",
    description: "Fetch a single repository's metadata",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
    ],
    trim: "repository",
  }),

  op({
    name: "repository.list",
    description: "List repositories in a workspace",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "q", role: "query", description: "BBQL filter. E.g. `name~\"foo\"`" },
      { name: "sort", role: "query", description: "Field to sort by (e.g. -updated_on)" },
      { name: "role", role: "query", description: "owner | admin | contributor | member" },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query", description: "Items per page (max 100)" },
    ],
    trim: "repositoryList",
  }),
];

// Sanity-check at module load: every `trim` value must exist in the
// local registry. Catches typos in operation declarations the moment
// the module is imported. Skipped at runtime in production (~5µs check
// but the value is in the failure case).
import { trimRegistry } from "./trim-registry.js";
for (const o of operations) {
  if (o.trim && !(o.trim in trimRegistry)) {
    throw new Error(
      `operations.ts: operation ${o.name} declares trim="${o.trim}" which is not in trimRegistry`,
    );
  }
}
