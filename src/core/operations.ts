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
      { name: "fields", role: "query", description: "Bitbucket fields= projection. E.g. `+values.participants` to include participants stripped by default." },
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

  op({
    name: "pullrequest.comment_get",
    description: "Fetch one comment on a pull request",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/comments/{comment_id}",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "comment_id", role: "path", required: true },
    ],
    trim: "comment",
  }),

  op({
    name: "pullrequest.comment_resolve",
    description: "Mark a comment thread as resolved",
    verb: "POST",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/comments/{comment_id}/resolve",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "comment_id", role: "path", required: true },
    ],
    trim: "ack",
  }),

  op({
    name: "pullrequest.comment_reopen",
    description: "Re-open a previously-resolved comment thread",
    verb: "DELETE",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/comments/{comment_id}/resolve",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "comment_id", role: "path", required: true },
    ],
    trim: "ack",
  }),

  // --- PR tasks ------------------------------------------------------

  op({
    name: "pullrequest.tasks_list",
    description: "List tasks on a pull request",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/tasks",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "q", role: "query", description: 'BBQL (e.g. state="UNRESOLVED")' },
      { name: "sort", role: "query" },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query" },
    ],
    trim: "taskList",
  }),

  op({
    name: "pullrequest.task_get",
    description: "Fetch one task by id",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/tasks/{task_id}",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "task_id", role: "path", required: true },
    ],
    trim: "task",
  }),

  op({
    name: "pullrequest.task_create",
    description: "Add a task to a pull request",
    verb: "POST",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/tasks",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "content", role: "body", required: true, description: "{ raw: <task body> }" },
      { name: "comment", role: "body", description: "{ id: <comment_id> } to anchor task to a comment" },
    ],
    trim: "ack",
  }),

  op({
    name: "pullrequest.task_update",
    description: "Update a task's content or state",
    verb: "PUT",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/tasks/{task_id}",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "task_id", role: "path", required: true },
      { name: "content", role: "body", description: "{ raw } to edit the task body" },
      { name: "state", role: "body", description: "RESOLVED | UNRESOLVED" },
    ],
    trim: "ack",
  }),

  op({
    name: "pullrequest.task_delete",
    description: "Delete a task",
    verb: "DELETE",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/tasks/{task_id}",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "task_id", role: "path", required: true },
    ],
    trim: "ack",
  }),

  // --- PR activity / commits / statuses / drafts / create-update ----

  op({
    name: "pullrequest.activity",
    description: "Stream of PR activity: approvals, comments, state changes",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/activity",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query" },
    ],
    trim: "activityList",
  }),

  op({
    name: "pullrequest.commits",
    description: "Commits included in a pull request",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/commits",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query" },
    ],
    trim: "commitList",
  }),

  op({
    name: "pullrequest.statuses",
    description: "Build/CI statuses reported against the PR's head commit",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/statuses",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "q", role: "query", description: 'BBQL (e.g. state="FAILED")' },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query" },
    ],
    trim: "commitStatusList",
  }),

  op({
    name: "pullrequest.convert_to_draft",
    description: "Convert a published PR to a draft",
    verb: "POST",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/draft",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
    ],
    trim: "ack",
  }),

  op({
    name: "pullrequest.publish_draft",
    description: "Publish a draft PR (move it out of draft state)",
    verb: "DELETE",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/draft",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
    ],
    trim: "ack",
  }),

  op({
    name: "pullrequest.create",
    description: "Create a new pull request",
    verb: "POST",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "title", role: "body", required: true },
      { name: "source", role: "body", required: true, description: "{ branch: { name } }" },
      { name: "destination", role: "body", description: "{ branch: { name } } — default: repo mainbranch" },
      { name: "summary", role: "body", description: "{ raw: <markdown body> }" },
      { name: "reviewers", role: "body", description: "Array of { uuid } account references" },
      { name: "close_source_branch", role: "body", description: "Delete source branch on merge (default false)" },
      { name: "draft", role: "body", description: "Create as draft (default false)" },
    ],
    trim: "ack",
  }),

  op({
    name: "pullrequest.update",
    description: "Update title / summary / destination / reviewers on a PR",
    verb: "PUT",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pr_id", role: "path", required: true },
      { name: "title", role: "body" },
      { name: "summary", role: "body", description: "{ raw }" },
      { name: "destination", role: "body" },
      { name: "reviewers", role: "body" },
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

  op({
    name: "repository.default_reviewers",
    description: "List default reviewers configured on a repository",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/default-reviewers",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query" },
    ],
    trim: "accountList",
  }),

  op({
    name: "repository.effective_default_reviewers",
    description: "Resolved default reviewers (repo + project + inherited)",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/effective-default-reviewers",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query" },
    ],
    trim: "accountList",
  }),

  // ====================================================================
  // COMMITS
  // ====================================================================

  op({
    name: "commit.get",
    description: "Fetch one commit by hash",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/commit/{commit_hash}",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "commit_hash", role: "path", required: true, description: "Full or short commit hash" },
    ],
    trim: "commit",
  }),

  op({
    name: "commit.list",
    description: "List commits on a branch / ref (default: repository's main branch)",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/commits",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "include", role: "query", description: "Comma-separated refs to walk from (default: main branch)" },
      { name: "exclude", role: "query", description: "Comma-separated refs to subtract" },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query", description: "Items per page (max 100; default 30)" },
    ],
    trim: "commitList",
  }),

  op({
    name: "commit.statuses",
    description: "Build/CI statuses reported against a commit (success/in-progress/failed)",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/commit/{commit_hash}/statuses",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "commit_hash", role: "path", required: true },
      { name: "q", role: "query", description: "BBQL filter (e.g. state=\"FAILED\")" },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query" },
    ],
    trim: "commitStatusList",
  }),

  // ====================================================================
  // PIPELINES
  // ====================================================================

  op({
    name: "pipeline.list_runs",
    description: "List pipeline runs in a repository (sortable, filterable)",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pipelines",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "q", role: "query", description: "BBQL filter (e.g. target.ref_name=\"main\")" },
      { name: "sort", role: "query", description: "Default `-created_on`" },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query" },
    ],
    trim: "pipelineRunList",
  }),

  op({
    name: "pipeline.get_run",
    description: "Fetch one pipeline run",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pipeline_uuid", role: "path", required: true, description: "Pipeline run uuid (with curly braces)" },
    ],
    trim: "pipelineRun",
  }),

  op({
    name: "pipeline.run",
    description: "Trigger a new pipeline run. Body specifies target ref + optional selector/variables.",
    verb: "POST",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pipelines",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "target", role: "body", required: true, description: "{ ref_type, ref_name, type, selector?: { type, pattern? } }" },
      { name: "variables", role: "body", description: "Array of { key, value, secured? }" },
    ],
    trim: "pipelineRun",
  }),

  op({
    name: "pipeline.stop",
    description: "Stop a running pipeline",
    verb: "POST",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/stopPipeline",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pipeline_uuid", role: "path", required: true },
    ],
    trim: "ack",
  }),

  op({
    name: "pipeline.steps_list",
    description: "List steps for a pipeline run",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pipeline_uuid", role: "path", required: true },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query" },
    ],
    trim: "pipelineStepList",
  }),

  op({
    name: "pipeline.step_get",
    description: "Fetch one pipeline step",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "pipeline_uuid", role: "path", required: true },
      { name: "step_uuid", role: "path", required: true },
    ],
    trim: "pipelineStep",
  }),

  // Note: pipeline.step_logs is NOT a manifest op because the endpoint
  // returns text/plain (not JSON) and the tool applies server-side
  // filtering (tail/grep/errors_only/context_lines). The custom-handler
  // path in tools/pipeline.ts hits the API directly via client.getText().

  // ====================================================================
  // BRANCHING MODEL
  // ====================================================================

  op({
    name: "branching.repo_model",
    description: "Fetch the branching model declared for a repository (branch types, dev/prod branches)",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/branching-model",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
    ],
    trim: "branchingModel",
  }),

  op({
    name: "branching.repo_settings",
    description: "Fetch repo-level branching-model settings (enabled flags per branch type)",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/branching-model/settings",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
    ],
    trim: "branchingSettings",
  }),

  op({
    name: "branching.repo_settings_update",
    description: "Update repo-level branching-model settings (toggle branch types, change dev/prod branch)",
    verb: "PUT",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/branching-model/settings",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
      { name: "branch_types", role: "body", description: "Array of { kind, enabled?, prefix? }" },
      { name: "development", role: "body", description: "{ name?: branch_name, use_mainbranch?: bool }" },
      { name: "production", role: "body", description: "{ enabled, name?, use_mainbranch? }" },
    ],
    trim: "ack",
  }),

  op({
    name: "branching.repo_effective",
    description: "Fetch the effective branching model (resolved repo + project + inherited defaults)",
    verb: "GET",
    pathTemplate: "/repositories/{workspace}/{repo_slug}/effective-branching-model",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "repo_slug", role: "path", required: true },
    ],
    trim: "branchingModel",
  }),

  op({
    name: "branching.project_model",
    description: "Fetch the branching model declared for a project",
    verb: "GET",
    pathTemplate: "/workspaces/{workspace}/projects/{project_key}/branching-model",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "project_key", role: "path", required: true },
    ],
    trim: "branchingModel",
  }),

  op({
    name: "branching.project_settings",
    description: "Fetch project-level branching-model settings",
    verb: "GET",
    pathTemplate: "/workspaces/{workspace}/projects/{project_key}/branching-model/settings",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "project_key", role: "path", required: true },
    ],
    trim: "branchingSettings",
  }),

  op({
    name: "branching.project_settings_update",
    description: "Update project-level branching-model settings",
    verb: "PUT",
    pathTemplate: "/workspaces/{workspace}/projects/{project_key}/branching-model/settings",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "project_key", role: "path", required: true },
      { name: "branch_types", role: "body" },
      { name: "development", role: "body" },
      { name: "production", role: "body" },
    ],
    trim: "ack",
  }),

  // ====================================================================
  // USER
  // ====================================================================

  op({
    name: "user.me",
    description: "Fetch the currently authenticated user",
    verb: "GET",
    pathTemplate: "/user",
    params: [],
    trim: "account",
  }),

  op({
    name: "user.get",
    description: "Fetch a user by uuid or account_id (no general search; Bitbucket Cloud deprecated /users/search)",
    verb: "GET",
    pathTemplate: "/users/{selected_user}",
    params: [
      { name: "selected_user", role: "path", required: true, description: "User uuid (with curly braces) or account_id" },
    ],
    trim: "account",
  }),

  // ====================================================================
  // WORKSPACE
  // ====================================================================

  op({
    name: "workspace.list",
    description: "List workspaces the authenticated user belongs to",
    verb: "GET",
    pathTemplate: "/workspaces",
    params: [
      { name: "q", role: "query", description: "BBQL filter (e.g. is_private=true)" },
      { name: "sort", role: "query" },
      { name: "role", role: "query", description: "owner | collaborator | member" },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query" },
    ],
    trim: "workspaceList",
  }),

  op({
    name: "workspace.get",
    description: "Fetch a workspace's metadata",
    verb: "GET",
    pathTemplate: "/workspaces/{workspace}",
    params: [
      { name: "workspace", role: "path", required: true },
    ],
    trim: "workspace",
  }),

  op({
    name: "workspace.members",
    description: "List members of a workspace",
    verb: "GET",
    pathTemplate: "/workspaces/{workspace}/members",
    params: [
      { name: "workspace", role: "path", required: true },
      { name: "q", role: "query" },
      { name: "page", role: "query" },
      { name: "pagelen", role: "query" },
    ],
    trim: "workspaceMemberList",
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
