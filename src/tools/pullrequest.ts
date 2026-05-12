// bitbucket_pullrequest — consolidated PR tool.
//
// Phase 1: get, list (read).
// Phase 3 cherry-pick: approve, unapprove, merge, decline (review writes);
//                       comments_list, comment_add, comment_update, comment_delete.
// Skipped: comment_get, comment_resolve, comment_reopen, task_*, activity,
// commits, statuses, create, update, convert_to_draft, publish_draft —
// add when actually needed.

import { z } from "zod";

import type { ConsolidatedToolDef } from "./dispatcher.js";
import { positiveInt } from "./schemas.js";

// Common identifying fields shared across read + write actions on a
// specific PR. Composed via z.object spread to keep each per-action
// schema flat (which matters for `mergeActionSchemas` to surface
// individual fields in the tool's JSON Schema).
const prTargetFields = {
  workspace: z.string().optional(),
  repo_slug: z.string().describe("Repository slug"),
  pr_id: positiveInt.describe("Pull request id (number or numeric string, e.g. 39636 or \"39636\")"),
};

const GetSchema = z.object({
  ...prTargetFields,
  fields: z
    .string()
    .optional()
    .describe("Bitbucket fields= projection (advanced; rarely needed)"),
});

const ListSchema = z.object({
  workspace: z.string().optional(),
  repo_slug: z.string().describe("Repository slug"),
  state: z
    .string()
    .optional()
    .describe(
      "State filter: OPEN | MERGED | DECLINED | SUPERSEDED. Comma-separated for multiple.",
    ),
  q: z
    .string()
    .optional()
    .describe(
      'BBQL filter. Examples: `state="OPEN" AND author.uuid="{...}"`, `updated_on>=2026-01-01`',
    ),
  sort: z
    .string()
    .optional()
    .describe(
      "Sort field. Prefix with `-` for descending. Default `-updated_on`.",
    ),
  page: positiveInt.optional(),
  pagelen: positiveInt
    .pipe(z.number().max(50))
    .optional()
    .describe("Items per page (max 50; default 10)"),
});

const ApproveSchema = z.object({ ...prTargetFields });
const UnapproveSchema = z.object({ ...prTargetFields });
const DeclineSchema = z.object({ ...prTargetFields });

// Bitbucket Cloud's /merge endpoint expects a body with optional
// fields. We accept caller-friendly flat args and reshape via
// `.transform` so the dispatcher hands the right body to the SDK.
const MergeSchema = z
  .object({
    ...prTargetFields,
    message: z.string().optional().describe("Override the auto-generated merge commit message"),
    close_source_branch: z
      .boolean()
      .optional()
      .describe("Delete the source branch after merge"),
    merge_strategy: z
      .enum(["merge_commit", "squash", "fast_forward"])
      .optional()
      .describe("Strategy for combining commits; default depends on repo settings"),
  })
  .transform((data) => ({
    workspace: data.workspace,
    repo_slug: data.repo_slug,
    pr_id: data.pr_id,
    // Bitbucket's body shape: top-level `type`, `message`,
    // `close_source_branch`, `merge_strategy`.
    type: "pullrequest_merge_parameters",
    message: data.message,
    close_source_branch: data.close_source_branch,
    merge_strategy: data.merge_strategy,
  }));

const CommentsListSchema = z.object({
  ...prTargetFields,
  q: z.string().optional().describe("BBQL filter (e.g. inline.path~\"foo.ts\")"),
  sort: z.string().optional(),
  page: positiveInt.optional(),
  pagelen: positiveInt
    .pipe(z.number().max(100))
    .optional()
    .describe("Items per page (max 100; default 25)"),
});

// Comment-add accepts flat args (content as string, parent_id, inline_*)
// and reshapes to Bitbucket's nested body via `.transform`.
const CommentAddSchema = z
  .object({
    ...prTargetFields,
    content: z.string().describe("Comment body in markdown"),
    parent_id: positiveInt
      .optional()
      .describe("Reply to an existing comment (its id)"),
    inline_path: z
      .string()
      .optional()
      .describe("File path for line-anchored inline comments"),
    inline_to: positiveInt
      .optional()
      .describe("New-side line number for inline comments"),
    inline_from: positiveInt
      .optional()
      .describe("Old-side line number for inline comments"),
  })
  .transform((data) => {
    const out: Record<string, unknown> = {
      workspace: data.workspace,
      repo_slug: data.repo_slug,
      pr_id: data.pr_id,
      content: { raw: data.content },
    };
    if (data.parent_id !== undefined) out.parent = { id: data.parent_id };
    if (
      data.inline_path !== undefined ||
      data.inline_to !== undefined ||
      data.inline_from !== undefined
    ) {
      const inline: Record<string, unknown> = {};
      if (data.inline_path !== undefined) inline.path = data.inline_path;
      if (data.inline_to !== undefined) inline.to = data.inline_to;
      if (data.inline_from !== undefined) inline.from = data.inline_from;
      out.inline = inline;
    }
    return out;
  });

const CommentUpdateSchema = z
  .object({
    ...prTargetFields,
    comment_id: positiveInt.describe("Comment id"),
    content: z.string().describe("Replacement comment body (markdown)"),
  })
  .transform((data) => ({
    workspace: data.workspace,
    repo_slug: data.repo_slug,
    pr_id: data.pr_id,
    comment_id: data.comment_id,
    content: { raw: data.content },
  }));

const CommentDeleteSchema = z.object({
  ...prTargetFields,
  comment_id: positiveInt.describe("Comment id"),
});

export const pullRequestTool: ConsolidatedToolDef = {
  name: "bitbucket_pullrequest",
  description:
    "Read and act on pull requests. Read actions return trimmed summaries; " +
    "write actions return a compact ack (`{ok, id?, state?, ...}`). The full " +
    "raw response is cached server-side; pass `response_format: \"detailed\"` " +
    "(Phase 3 polish) when you need it.",
  actions: {
    get: {
      operation: "pullrequest.get",
      schema: GetSchema,
      description: "Fetch one PR by id",
    },
    list: {
      operation: "pullrequest.list",
      schema: ListSchema,
      description: "List PRs in a repository (paginated, filtered via state/q/sort)",
    },
    approve: {
      operation: "pullrequest.approve",
      schema: ApproveSchema,
      description: "Approve the PR as the authenticated user",
    },
    unapprove: {
      operation: "pullrequest.unapprove",
      schema: UnapproveSchema,
      description: "Withdraw your approval on the PR",
    },
    merge: {
      operation: "pullrequest.merge",
      schema: MergeSchema,
      description: "Merge the PR (pass merge_strategy / message / close_source_branch to override defaults)",
    },
    decline: {
      operation: "pullrequest.decline",
      schema: DeclineSchema,
      description: "Decline (close without merging) the PR",
    },
    comments_list: {
      operation: "pullrequest.comments_list",
      schema: CommentsListSchema,
      description: "List comments on the PR (inline + general, top-level + replies)",
    },
    comment_add: {
      operation: "pullrequest.comment_add",
      schema: CommentAddSchema,
      description: "Add a comment; pass parent_id to reply, inline_path+inline_to to anchor to a line",
    },
    comment_update: {
      operation: "pullrequest.comment_update",
      schema: CommentUpdateSchema,
      description: "Edit an existing comment's body",
    },
    comment_delete: {
      operation: "pullrequest.comment_delete",
      schema: CommentDeleteSchema,
      description: "Delete a comment (leaves a tombstone)",
    },
  },
};
