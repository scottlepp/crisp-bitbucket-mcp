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
