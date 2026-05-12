// bitbucket_pullrequest — consolidated PR tool.
//
// Full surface (Phase 3 complete): read (get, list, list_pending_review,
// activity, commits, statuses); review writes (approve, unapprove, merge,
// decline); draft toggles (convert_to_draft, publish_draft); meta writes
// (create, update); comments (comments_list, comment_get, comment_add,
// comment_update, comment_delete, comment_resolve, comment_reopen);
// tasks (tasks_list, task_get, task_create, task_update, task_delete).

import { z } from "zod";

import type { ConsolidatedToolDef, DispatcherContext } from "@scottlepp/mcp-toolkit/tool";
import { positiveInt } from "@scottlepp/mcp-toolkit/schemas";

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
  fields: z
    .string()
    .optional()
    .describe(
      "Bitbucket fields= projection (advanced). Example: `+values.participants` to include the participants array that Bitbucket strips by default.",
    ),
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

const CommentGetSchema = z.object({
  ...prTargetFields,
  comment_id: positiveInt.describe("Comment id"),
});

const CommentResolveSchema = z.object({
  ...prTargetFields,
  comment_id: positiveInt.describe("Comment id"),
});

const CommentReopenSchema = z.object({
  ...prTargetFields,
  comment_id: positiveInt.describe("Comment id"),
});

// --- Tasks ---

const TasksListSchema = z.object({
  ...prTargetFields,
  q: z.string().optional().describe('BBQL filter (e.g. state="UNRESOLVED")'),
  sort: z.string().optional(),
  page: positiveInt.optional(),
  pagelen: positiveInt.pipe(z.number().max(100)).optional(),
});

const TaskGetSchema = z.object({
  ...prTargetFields,
  task_id: positiveInt.describe("Task id"),
});

const TaskCreateSchema = z
  .object({
    ...prTargetFields,
    content: z.string().describe("Task body in markdown"),
    comment_id: positiveInt
      .optional()
      .describe("Anchor task to an existing comment"),
  })
  .transform((data) => {
    const out: Record<string, unknown> = {
      workspace: data.workspace,
      repo_slug: data.repo_slug,
      pr_id: data.pr_id,
      content: { raw: data.content },
    };
    if (data.comment_id !== undefined) out.comment = { id: data.comment_id };
    return out;
  });

const TaskUpdateSchema = z
  .object({
    ...prTargetFields,
    task_id: positiveInt.describe("Task id"),
    content: z.string().optional().describe("New task body"),
    state: z
      .enum(["RESOLVED", "UNRESOLVED"])
      .optional()
      .describe("Toggle resolved/unresolved"),
  })
  .transform((data) => {
    const out: Record<string, unknown> = {
      workspace: data.workspace,
      repo_slug: data.repo_slug,
      pr_id: data.pr_id,
      task_id: data.task_id,
    };
    if (data.content !== undefined) out.content = { raw: data.content };
    if (data.state !== undefined) out.state = data.state;
    return out;
  });

const TaskDeleteSchema = z.object({
  ...prTargetFields,
  task_id: positiveInt.describe("Task id"),
});

// --- Activity / commits / statuses ---

const ActivitySchema = z.object({
  ...prTargetFields,
  page: positiveInt.optional(),
  pagelen: positiveInt.pipe(z.number().max(100)).optional(),
});

const CommitsSchema = z.object({
  ...prTargetFields,
  page: positiveInt.optional(),
  pagelen: positiveInt.pipe(z.number().max(100)).optional(),
});

const StatusesSchema = z.object({
  ...prTargetFields,
  q: z.string().optional().describe('BBQL (e.g. state="FAILED")'),
  page: positiveInt.optional(),
  pagelen: positiveInt.pipe(z.number().max(100)).optional(),
});

// --- Draft toggles ---

const ConvertToDraftSchema = z.object({ ...prTargetFields });
const PublishDraftSchema = z.object({ ...prTargetFields });

// --- PR meta writes ---

const CreateSchema = z
  .object({
    workspace: z.string().optional(),
    repo_slug: z.string().describe("Repository slug"),
    title: z.string().describe("PR title"),
    source_branch: z.string().describe("Source branch name"),
    destination_branch: z
      .string()
      .optional()
      .describe("Destination branch (default: repository mainbranch)"),
    summary: z.string().optional().describe("PR description / summary in markdown"),
    reviewer_uuids: z
      .array(z.string())
      .optional()
      .describe("Reviewer uuids (with curly braces)"),
    close_source_branch: z
      .boolean()
      .optional()
      .describe("Delete source branch on merge (default false)"),
    draft: z
      .boolean()
      .optional()
      .describe("Create as draft (default false)"),
  })
  .transform((data) => {
    const out: Record<string, unknown> = {
      workspace: data.workspace,
      repo_slug: data.repo_slug,
      title: data.title,
      source: { branch: { name: data.source_branch } },
    };
    if (data.destination_branch !== undefined) {
      out.destination = { branch: { name: data.destination_branch } };
    }
    if (data.summary !== undefined) out.summary = { raw: data.summary };
    if (data.reviewer_uuids !== undefined) {
      out.reviewers = data.reviewer_uuids.map((uuid) => ({ uuid }));
    }
    if (data.close_source_branch !== undefined) {
      out.close_source_branch = data.close_source_branch;
    }
    if (data.draft !== undefined) out.draft = data.draft;
    return out;
  });

const UpdateSchema = z
  .object({
    ...prTargetFields,
    title: z.string().optional(),
    summary: z.string().optional().describe("Replacement PR body (markdown)"),
    destination_branch: z.string().optional(),
    reviewer_uuids: z.array(z.string()).optional(),
  })
  .transform((data) => {
    const out: Record<string, unknown> = {
      workspace: data.workspace,
      repo_slug: data.repo_slug,
      pr_id: data.pr_id,
    };
    if (data.title !== undefined) out.title = data.title;
    if (data.summary !== undefined) out.summary = { raw: data.summary };
    if (data.destination_branch !== undefined) {
      out.destination = { branch: { name: data.destination_branch } };
    }
    if (data.reviewer_uuids !== undefined) {
      out.reviewers = data.reviewer_uuids.map((uuid) => ({ uuid }));
    }
    return out;
  });

// --- list_pending_review (custom handler) ---
//
// "PRs where I'm a requested reviewer and haven't approved yet" is a
// recurring review-queue query. There's no dedicated Bitbucket
// endpoint, so we synthesize: fetch /user to get the caller's uuid,
// then invoke pullrequest.list with a BBQL `q` filter.
//
// Two HTTP calls per invocation (no /user cache yet — Phase 4 polish).

const ListPendingReviewSchema = z.object({
  workspace: z.string().optional(),
  repo_slug: z.string().describe("Repository slug"),
  page: positiveInt.optional(),
  pagelen: positiveInt.pipe(z.number().max(50)).optional(),
});

import { invokeOperation } from "@scottlepp/mcp-toolkit/manifest";

const listPendingReviewHandler = async (
  args: Record<string, unknown>,
  ctx: DispatcherContext,
): Promise<unknown> => {
  const a = args as {
    workspace?: string;
    repo_slug: string;
    page?: number;
    pagelen?: number;
  };
  // Cheap call; Bitbucket caches /user on the edge so this rarely
  // costs >50ms even at the second hop.
  const me = (await ctx.client.get("/user")) as { uuid?: string };
  if (!me.uuid) {
    throw new Error("list_pending_review: /user did not return a uuid");
  }
  const finalArgs: Record<string, unknown> = {
    workspace: a.workspace,
    repo_slug: a.repo_slug,
    state: "OPEN",
    q: `reviewers.uuid="${me.uuid}"`,
    page: a.page,
    pagelen: a.pagelen,
  };
  const withDefault = ctx.preprocess
    ? ctx.preprocess("pullrequest.list", finalArgs)
    : finalArgs;
  return invokeOperation(
    ctx.manifest,
    ctx.client,
    "pullrequest.list",
    withDefault,
    ctx.trimRegistry,
    ctx.invokeOptions,
  );
};

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
    comment_get: {
      operation: "pullrequest.comment_get",
      schema: CommentGetSchema,
      description: "Fetch one comment by id",
    },
    comment_resolve: {
      operation: "pullrequest.comment_resolve",
      schema: CommentResolveSchema,
      description: "Mark a comment thread as resolved",
    },
    comment_reopen: {
      operation: "pullrequest.comment_reopen",
      schema: CommentReopenSchema,
      description: "Re-open a previously-resolved comment thread",
    },
    tasks_list: {
      operation: "pullrequest.tasks_list",
      schema: TasksListSchema,
      description: "List tasks on the PR",
    },
    task_get: {
      operation: "pullrequest.task_get",
      schema: TaskGetSchema,
      description: "Fetch one task by id",
    },
    task_create: {
      operation: "pullrequest.task_create",
      schema: TaskCreateSchema,
      description: "Add a task; pass comment_id to anchor it to a comment",
    },
    task_update: {
      operation: "pullrequest.task_update",
      schema: TaskUpdateSchema,
      description: "Update a task's body or toggle resolved/unresolved",
    },
    task_delete: {
      operation: "pullrequest.task_delete",
      schema: TaskDeleteSchema,
      description: "Delete a task",
    },
    activity: {
      operation: "pullrequest.activity",
      schema: ActivitySchema,
      description: "Stream of PR events: approvals, comments, state changes",
    },
    commits: {
      operation: "pullrequest.commits",
      schema: CommitsSchema,
      description: "Commits included in the PR",
    },
    statuses: {
      operation: "pullrequest.statuses",
      schema: StatusesSchema,
      description: "Build/CI statuses on the PR's head commit",
    },
    convert_to_draft: {
      operation: "pullrequest.convert_to_draft",
      schema: ConvertToDraftSchema,
      description: "Convert a published PR back to a draft",
    },
    publish_draft: {
      operation: "pullrequest.publish_draft",
      schema: PublishDraftSchema,
      description: "Publish a draft PR (move it out of draft state)",
    },
    create: {
      operation: "pullrequest.create",
      schema: CreateSchema,
      description: "Create a new pull request",
    },
    update: {
      operation: "pullrequest.update",
      schema: UpdateSchema,
      description: "Update title / summary / destination / reviewers on a PR",
    },
    list_pending_review: {
      // Custom handler: fetches /user, then invokes pullrequest.list
      // with reviewers.uuid=<me> filter pre-applied.
      schema: ListPendingReviewSchema,
      description: "List OPEN PRs in a repo where you're a requested reviewer",
      handler: listPendingReviewHandler,
    },
  },
};
