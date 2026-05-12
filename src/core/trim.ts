// Entity-specific trim projections for Bitbucket Cloud responses.
//
// The full untrimmed response always lands on disk via the SDK's
// sandbox; these summaries are what surfaces in-band. Aggressive
// allowlist-style projections — drop links, avatars, deeply-nested
// repository duplicates, rendered.html duplicates of raw markdown.

import { paginatedListSummary, pick } from "@scottlepp/mcp-toolkit/trim";
import { createMutationAck } from "@scottlepp/mcp-toolkit/mutation-ack";

import type {
  BitbucketAccount,
  BitbucketActivityEntry,
  BitbucketBranchRef,
  BitbucketComment,
  BitbucketCommit,
  BitbucketParticipant,
  BitbucketPaginated,
  BitbucketPipelineRun,
  BitbucketPipelineStep,
  BitbucketPullRequest,
  BitbucketRepository,
  BitbucketTask,
  BitbucketWorkspace,
  BitbucketWorkspaceMembership,
} from "../types/bitbucket.js";

// --- Account ----------------------------------------------------------

export interface AccountSummary {
  uuid: string;
  display_name: string;
  nickname?: string;
  type?: string;
}

export function accountSummary(
  a: BitbucketAccount | null | undefined,
): AccountSummary | null {
  if (!a) return null;
  return pick(a, ["uuid", "display_name", "nickname", "type"]);
}

// --- Branch ref -------------------------------------------------------

export interface BranchSummary {
  branch: string;
  commit?: string;
}

export function branchSummary(b: BitbucketBranchRef | undefined): BranchSummary | null {
  if (!b) return null;
  return {
    branch: b.branch?.name ?? "",
    commit: b.commit?.hash,
  };
}

// --- Participant / reviewer ------------------------------------------

export interface ReviewerSummary {
  uuid: string;
  display_name: string;
  approved: boolean;
  state?: string | null;
}

export function reviewerSummary(p: BitbucketParticipant): ReviewerSummary {
  return {
    uuid: p.user.uuid,
    display_name: p.user.display_name,
    approved: p.approved,
    state: p.state ?? undefined,
  };
}

// --- Pull request -----------------------------------------------------

// Prefer the raw markdown body of summary/description over rendered.html.
// HTML is verbose and the markdown form preserves all formatting agents
// care about.
function bestBody(
  pr: BitbucketPullRequest,
): string | undefined {
  return (
    pr.rendered?.description?.raw ??
    pr.summary?.raw ??
    pr.description
  );
}

export interface PullRequestSummary {
  id: number;
  title: string;
  state: string;
  author: AccountSummary | null;
  source: BranchSummary | null;
  destination: BranchSummary | null;
  created_on: string;
  updated_on: string;
  comment_count?: number;
  task_count?: number;
  reviewers: ReviewerSummary[];
  description?: string;
  merge_commit?: string;
  closed_by?: AccountSummary | null;
}

export function pullRequestSummary(pr: BitbucketPullRequest): PullRequestSummary {
  // Reviewers come either from `participants` (richer, with approval
  // state) or fall back to bare `reviewers` (just identities). Prefer
  // participants when present.
  const reviewersOut: ReviewerSummary[] = pr.participants
    ? pr.participants
        .filter((p) => p.role === "REVIEWER")
        .map(reviewerSummary)
    : (pr.reviewers ?? []).map((r) => ({
        uuid: r.uuid,
        display_name: r.display_name,
        approved: false,
      }));

  return {
    id: pr.id,
    title: pr.title,
    state: pr.state,
    author: accountSummary(pr.author),
    source: branchSummary(pr.source),
    destination: branchSummary(pr.destination),
    created_on: pr.created_on,
    updated_on: pr.updated_on,
    comment_count: pr.comment_count,
    task_count: pr.task_count,
    reviewers: reviewersOut,
    description: bestBody(pr),
    merge_commit: pr.merge_commit?.hash,
    closed_by: pr.closed_by ? accountSummary(pr.closed_by) : undefined,
  };
}

// --- Pull request row (list endpoints) -------------------------------

// Compact row for `list` endpoints — small enough to inline N rows
// without blowing the budget. Drops description and participants;
// callers who want detail re-fetch by id.
export interface PullRequestRow {
  id: number;
  title: string;
  state: string;
  author: AccountSummary | null;
  source_branch?: string;
  destination_branch?: string;
  updated_on: string;
  comment_count?: number;
}

export function pullRequestRow(pr: BitbucketPullRequest): PullRequestRow {
  return {
    id: pr.id,
    title: pr.title,
    state: pr.state,
    author: accountSummary(pr.author),
    source_branch: pr.source?.branch?.name,
    destination_branch: pr.destination?.branch?.name,
    updated_on: pr.updated_on,
    comment_count: pr.comment_count,
  };
}

// --- Pull request list ------------------------------------------------

export interface PullRequestListSummary {
  total?: number;
  page?: number;
  pagelen?: number;
  next?: string;
  values: PullRequestRow[];
}

export function pullRequestListSummary(
  raw: unknown,
): PullRequestListSummary {
  const r = raw as BitbucketPaginated<BitbucketPullRequest>;
  return {
    total: r.size,
    page: r.page,
    pagelen: r.pagelen,
    next: r.next,
    values: (r.values ?? []).map(pullRequestRow),
  };
}

// --- Repository -------------------------------------------------------

export interface RepositorySummary {
  uuid: string;
  full_name: string;
  name: string;
  is_private: boolean;
  language?: string;
  size?: number;
  created_on: string;
  updated_on: string;
  mainbranch?: string;
  workspace?: { slug: string; name: string };
  project?: { key: string; name: string };
  description?: string;
}

export function repositorySummary(r: BitbucketRepository): RepositorySummary {
  return {
    uuid: r.uuid,
    full_name: r.full_name,
    name: r.name,
    is_private: r.is_private,
    language: r.language,
    size: r.size,
    created_on: r.created_on,
    updated_on: r.updated_on,
    mainbranch: r.mainbranch?.name,
    workspace: r.workspace
      ? { slug: r.workspace.slug, name: r.workspace.name }
      : undefined,
    project: r.project
      ? { key: r.project.key, name: r.project.name }
      : undefined,
    description: r.description,
  };
}

export interface RepositoryRow {
  uuid: string;
  full_name: string;
  is_private: boolean;
  language?: string;
  updated_on: string;
}

export function repositoryRow(r: BitbucketRepository): RepositoryRow {
  return {
    uuid: r.uuid,
    full_name: r.full_name,
    is_private: r.is_private,
    language: r.language,
    updated_on: r.updated_on,
  };
}

export interface RepositoryListSummary {
  total?: number;
  page?: number;
  pagelen?: number;
  next?: string;
  values: RepositoryRow[];
}

export function repositoryListSummary(raw: unknown): RepositoryListSummary {
  const r = raw as BitbucketPaginated<BitbucketRepository>;
  return {
    total: r.size,
    page: r.page,
    pagelen: r.pagelen,
    next: r.next,
    values: (r.values ?? []).map(repositoryRow),
  };
}

// --- Commit -----------------------------------------------------------

export interface CommitSummary {
  hash: string;
  short_hash: string;
  message_first_line: string;
  date: string;
  author?: AccountSummary | null;
  author_raw: string;
  parents: string[];
}

export function commitSummary(c: BitbucketCommit): CommitSummary {
  const firstLine = c.message.split("\n", 1)[0];
  return {
    hash: c.hash,
    short_hash: c.hash.slice(0, 7),
    message_first_line: firstLine,
    date: c.date,
    author: c.author.user ? accountSummary(c.author.user) : null,
    author_raw: c.author.raw,
    parents: (c.parents ?? []).map((p) => p.hash),
  };
}

export interface CommitRow {
  hash: string;
  short_hash: string;
  message_first_line: string;
  date: string;
  author_raw: string;
}

export function commitRow(c: BitbucketCommit): CommitRow {
  return {
    hash: c.hash,
    short_hash: c.hash.slice(0, 7),
    message_first_line: c.message.split("\n", 1)[0],
    date: c.date,
    author_raw: c.author.raw,
  };
}

export interface CommitListSummary {
  total?: number;
  next?: string;
  values: CommitRow[];
}

export function commitListSummary(raw: unknown): CommitListSummary {
  const r = raw as BitbucketPaginated<BitbucketCommit>;
  return {
    total: r.size,
    next: r.next,
    values: (r.values ?? []).map(commitRow),
  };
}

// --- Comment ----------------------------------------------------------

export interface CommentSummary {
  id: number;
  author: AccountSummary | null;
  body: string;
  created_on: string;
  updated_on?: string;
  // File/line for inline comments. Absent on general comments.
  inline?: { path: string; from?: number | null; to?: number | null };
  // Parent comment id for replies. Absent on top-level comments.
  parent_id?: number;
  resolved?: boolean;
  deleted?: boolean;
}

export function commentSummary(c: BitbucketComment): CommentSummary {
  return {
    id: c.id,
    author: accountSummary(c.user),
    body: c.content.raw ?? c.content.markup ?? "",
    created_on: c.created_on,
    updated_on: c.updated_on,
    inline: c.inline,
    parent_id: c.parent?.id,
    resolved: c.resolution !== undefined && c.resolution !== null ? true : undefined,
    deleted: c.deleted,
  };
}

export interface CommentRow {
  id: number;
  author_display_name?: string;
  body_first_line: string;
  created_on: string;
  inline_path?: string;
  parent_id?: number;
}

export function commentRow(c: BitbucketComment): CommentRow {
  const body = c.content.raw ?? c.content.markup ?? "";
  return {
    id: c.id,
    author_display_name: c.user?.display_name,
    body_first_line: body.split("\n", 1)[0],
    created_on: c.created_on,
    inline_path: c.inline?.path,
    parent_id: c.parent?.id,
  };
}

export interface CommentListSummary {
  total?: number;
  page?: number;
  pagelen?: number;
  next?: string;
  values: CommentRow[];
}

export function commentListSummary(raw: unknown): CommentListSummary {
  const r = raw as BitbucketPaginated<BitbucketComment>;
  return {
    total: r.size,
    page: r.page,
    pagelen: r.pagelen,
    next: r.next,
    values: (r.values ?? []).map(commentRow),
  };
}

// --- Workspace --------------------------------------------------------

export interface WorkspaceSummary {
  uuid: string;
  slug: string;
  name: string;
  is_private: boolean;
  created_on: string;
}

export function workspaceSummary(w: BitbucketWorkspace): WorkspaceSummary {
  return pick(w, ["uuid", "slug", "name", "is_private", "created_on"]);
}

export interface WorkspaceListSummary {
  total?: number;
  page?: number;
  pagelen?: number;
  next?: string;
  values: WorkspaceSummary[];
}

export function workspaceListSummary(raw: unknown): WorkspaceListSummary {
  const r = raw as BitbucketPaginated<BitbucketWorkspace>;
  return {
    total: r.size,
    page: r.page,
    pagelen: r.pagelen,
    next: r.next,
    values: (r.values ?? []).map(workspaceSummary),
  };
}

// --- Workspace membership --------------------------------------------

export interface WorkspaceMemberRow {
  uuid: string;
  display_name: string;
  nickname?: string;
  permission?: string;
}

export function workspaceMemberRow(m: BitbucketWorkspaceMembership): WorkspaceMemberRow {
  return {
    uuid: m.user.uuid,
    display_name: m.user.display_name,
    nickname: m.user.nickname,
    permission: m.permission,
  };
}

export interface WorkspaceMemberListSummary {
  total?: number;
  page?: number;
  pagelen?: number;
  next?: string;
  values: WorkspaceMemberRow[];
}

export function workspaceMemberListSummary(raw: unknown): WorkspaceMemberListSummary {
  const r = raw as BitbucketPaginated<BitbucketWorkspaceMembership>;
  return {
    total: r.size,
    page: r.page,
    pagelen: r.pagelen,
    next: r.next,
    values: (r.values ?? []).map(workspaceMemberRow),
  };
}

// --- Account (user.search, default-reviewers lists, etc.) ------------

// `accountSummary` is already declared for embedded account references
// (PR author, comment author). For LIST endpoints we want a row.

export type AccountRow = AccountSummary;

export interface AccountListSummary {
  total?: number;
  page?: number;
  pagelen?: number;
  next?: string;
  values: AccountRow[];
}

export function accountListSummary(raw: unknown): AccountListSummary {
  const r = raw as BitbucketPaginated<BitbucketAccount>;
  return {
    total: r.size,
    page: r.page,
    pagelen: r.pagelen,
    next: r.next,
    values: (r.values ?? [])
      .map((a) => accountSummary(a))
      .filter((a): a is AccountRow => a !== null),
  };
}

// --- Pipeline run -----------------------------------------------------

export interface PipelineRunSummary {
  uuid: string;
  build_number: number;
  state: string;            // PENDING | IN_PROGRESS | COMPLETED | HALTED ...
  result?: string;          // SUCCESSFUL | FAILED | STOPPED | ERROR (when COMPLETED)
  trigger_type?: string;    // PUSH | SCHEDULE | MANUAL | PULLREQUEST
  ref_name?: string;
  target_commit?: string;
  creator_display_name?: string;
  created_on?: string;
  completed_on?: string;
  duration_in_seconds?: number;
  build_seconds_used?: number;
}

export function pipelineRunSummary(r: BitbucketPipelineRun): PipelineRunSummary {
  return {
    uuid: r.uuid,
    build_number: r.build_number,
    state: r.state?.name ?? "",
    result: r.state?.result?.name,
    trigger_type: r.trigger?.name ?? r.trigger?.type,
    ref_name: r.target?.ref_name,
    target_commit: r.target?.commit?.hash,
    creator_display_name: r.creator?.display_name,
    created_on: r.created_on,
    completed_on: r.completed_on,
    duration_in_seconds: r.duration_in_seconds,
    build_seconds_used: r.build_seconds_used,
  };
}

export interface PipelineRunRow {
  uuid: string;
  build_number: number;
  state: string;
  result?: string;
  ref_name?: string;
  created_on?: string;
  duration_in_seconds?: number;
}

export function pipelineRunRow(r: BitbucketPipelineRun): PipelineRunRow {
  return {
    uuid: r.uuid,
    build_number: r.build_number,
    state: r.state?.name ?? "",
    result: r.state?.result?.name,
    ref_name: r.target?.ref_name,
    created_on: r.created_on,
    duration_in_seconds: r.duration_in_seconds,
  };
}

export interface PipelineRunListSummary {
  total?: number;
  page?: number;
  pagelen?: number;
  next?: string;
  values: PipelineRunRow[];
}

export function pipelineRunListSummary(raw: unknown): PipelineRunListSummary {
  const r = raw as BitbucketPaginated<BitbucketPipelineRun>;
  return {
    total: r.size,
    page: r.page,
    pagelen: r.pagelen,
    next: r.next,
    values: (r.values ?? []).map(pipelineRunRow),
  };
}

// --- Pipeline step ----------------------------------------------------

export interface PipelineStepSummary {
  uuid: string;
  name?: string;
  state: string;
  result?: string;
  stage?: string;
  started_on?: string;
  completed_on?: string;
  duration_in_seconds?: number;
  build_seconds_used?: number;
}

export function pipelineStepSummary(s: BitbucketPipelineStep): PipelineStepSummary {
  return {
    uuid: s.uuid,
    name: s.name,
    state: s.state?.name ?? "",
    result: s.state?.result?.name,
    stage: s.state?.stage?.name,
    started_on: s.started_on,
    completed_on: s.completed_on,
    duration_in_seconds: s.duration_in_seconds,
    build_seconds_used: s.build_seconds_used,
  };
}

export interface PipelineStepRow {
  uuid: string;
  name?: string;
  state: string;
  result?: string;
  duration_in_seconds?: number;
}

export function pipelineStepRow(s: BitbucketPipelineStep): PipelineStepRow {
  return {
    uuid: s.uuid,
    name: s.name,
    state: s.state?.name ?? "",
    result: s.state?.result?.name,
    duration_in_seconds: s.duration_in_seconds,
  };
}

export interface PipelineStepListSummary {
  total?: number;
  page?: number;
  pagelen?: number;
  next?: string;
  values: PipelineStepRow[];
}

export function pipelineStepListSummary(raw: unknown): PipelineStepListSummary {
  const r = raw as BitbucketPaginated<BitbucketPipelineStep>;
  return {
    total: r.size,
    page: r.page,
    pagelen: r.pagelen,
    next: r.next,
    values: (r.values ?? []).map(pipelineStepRow),
  };
}

// --- Commit status ----------------------------------------------------

// Bitbucket Cloud's commit-status objects: { state, key, name?, url?,
// description?, type ('build'), created_on, updated_on }. We project
// the actionable fields; the URL is short enough to keep, the
// description goes to a first line.

export interface CommitStatusRow {
  state: string;  // SUCCESSFUL | INPROGRESS | FAILED | STOPPED
  key: string;
  name?: string;
  url?: string;
  description_first_line?: string;
  updated_on?: string;
}

function pickFirstLine(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return s.split("\n", 1)[0];
}

export function commitStatusRow(s: unknown): CommitStatusRow {
  const r = s as {
    state?: string;
    key?: string;
    name?: string;
    url?: string;
    description?: string;
    updated_on?: string;
  };
  return {
    state: r.state ?? "",
    key: r.key ?? "",
    name: r.name,
    url: r.url,
    description_first_line: pickFirstLine(r.description),
    updated_on: r.updated_on,
  };
}

export interface CommitStatusListSummary {
  total?: number;
  page?: number;
  pagelen?: number;
  next?: string;
  values: CommitStatusRow[];
}

export function commitStatusListSummary(raw: unknown): CommitStatusListSummary {
  const r = raw as BitbucketPaginated<unknown>;
  return {
    total: r.size,
    page: r.page,
    pagelen: r.pagelen,
    next: r.next,
    values: (r.values ?? []).map(commitStatusRow),
  };
}

// --- Branching model --------------------------------------------------

// Bitbucket Cloud's branching-model object: `{ branch_types[], development,
// production?, links }`. branch_types declares the conventions (e.g.
// feature/<*>, hotfix/<*>) the repo or project enforces.
// `effective-branching-model` resolves the merged repo + project view.

export interface BranchingModelSummary {
  branch_types: Array<{ kind: string; prefix: string }>;
  development?: { name?: string; use_mainbranch?: boolean; branch?: { name: string } };
  production?: { name?: string; use_mainbranch?: boolean; enabled?: boolean; branch?: { name: string } };
}

export function branchingModelSummary(raw: unknown): BranchingModelSummary {
  const r = raw as {
    branch_types?: Array<{ kind?: string; prefix?: string }>;
    development?: BranchingModelSummary["development"];
    production?: BranchingModelSummary["production"];
  };
  return {
    branch_types: (r.branch_types ?? []).map((bt) => ({
      kind: bt.kind ?? "",
      prefix: bt.prefix ?? "",
    })),
    development: r.development,
    production: r.production,
  };
}

// Settings shape extends the model with `enabled` flags per branch_type.
export interface BranchingSettingsSummary {
  branch_types: Array<{ kind: string; prefix: string; enabled: boolean }>;
  development?: { name?: string; use_mainbranch?: boolean };
  production?: { name?: string; use_mainbranch?: boolean; enabled?: boolean };
}

export function branchingSettingsSummary(raw: unknown): BranchingSettingsSummary {
  const r = raw as {
    branch_types?: Array<{ kind?: string; prefix?: string; enabled?: boolean }>;
    development?: BranchingSettingsSummary["development"];
    production?: BranchingSettingsSummary["production"];
  };
  return {
    branch_types: (r.branch_types ?? []).map((bt) => ({
      kind: bt.kind ?? "",
      prefix: bt.prefix ?? "",
      enabled: bt.enabled ?? true,
    })),
    development: r.development,
    production: r.production,
  };
}

// --- Pull request task ------------------------------------------------

export interface TaskSummary {
  id: number;
  state: "RESOLVED" | "UNRESOLVED";
  content: string;
  creator: AccountSummary | null;
  created_on: string;
  updated_on?: string;
  resolved_on?: string | null;
  resolved_by?: AccountSummary | null;
}

export function taskSummary(t: BitbucketTask): TaskSummary {
  return {
    id: t.id,
    state: t.state,
    content: t.content.raw ?? t.content.markup ?? "",
    creator: accountSummary(t.creator),
    created_on: t.created_on,
    updated_on: t.updated_on,
    resolved_on: t.resolved_on,
    resolved_by: t.resolved_by ? accountSummary(t.resolved_by) : undefined,
  };
}

export interface TaskRow {
  id: number;
  state: "RESOLVED" | "UNRESOLVED";
  content_first_line: string;
  creator_display_name?: string;
  created_on: string;
}

export function taskRow(t: BitbucketTask): TaskRow {
  const body = t.content.raw ?? t.content.markup ?? "";
  return {
    id: t.id,
    state: t.state,
    content_first_line: body.split("\n", 1)[0],
    creator_display_name: t.creator?.display_name,
    created_on: t.created_on,
  };
}

export interface TaskListSummary {
  total?: number;
  page?: number;
  pagelen?: number;
  next?: string;
  values: TaskRow[];
}

export function taskListSummary(raw: unknown): TaskListSummary {
  const r = raw as BitbucketPaginated<BitbucketTask>;
  return {
    total: r.size,
    page: r.page,
    pagelen: r.pagelen,
    next: r.next,
    values: (r.values ?? []).map(taskRow),
  };
}

// --- Pull request activity --------------------------------------------

// Bitbucket's activity stream is heterogeneous. We flatten each entry
// into `{kind, date, user_display_name, detail}` — enough to scan the
// stream without paging through nested shapes. The agent can re-fetch
// specifics (`comment_get`, `get`) if a detail line catches its eye.

export interface ActivityRow {
  kind:
    | "approval"
    | "unapproval"
    | "changes_requested"
    | "changes_request_removal"
    | "comment"
    | "update"
    | "unknown";
  date?: string;
  user_display_name?: string;
  // Short, kind-specific descriptor. For `comment` this is the first
  // line of the body; for `update` it's the new state; for approval
  // events it's just "" (the kind itself is the story).
  detail?: string;
}

export function activityRow(e: BitbucketActivityEntry): ActivityRow {
  if (e.approval) {
    return {
      kind: "approval",
      date: e.approval.date,
      user_display_name: e.approval.user?.display_name,
    };
  }
  if (e.unapproval) {
    return {
      kind: "unapproval",
      date: e.unapproval.date,
      user_display_name: e.unapproval.user?.display_name,
    };
  }
  if (e.changes_requested) {
    return {
      kind: "changes_requested",
      date: e.changes_requested.date,
      user_display_name: e.changes_requested.user?.display_name,
    };
  }
  if (e.changes_request_removal) {
    return {
      kind: "changes_request_removal",
      date: e.changes_request_removal.date,
      user_display_name: e.changes_request_removal.user?.display_name,
    };
  }
  if (e.comment) {
    const body = e.comment.content.raw ?? e.comment.content.markup ?? "";
    return {
      kind: "comment",
      date: e.comment.created_on,
      user_display_name: e.comment.user?.display_name,
      detail: body.split("\n", 1)[0],
    };
  }
  if (e.update) {
    return {
      kind: "update",
      date: e.update.date,
      user_display_name: e.update.author?.display_name,
      detail: e.update.state ? `state → ${e.update.state}` : undefined,
    };
  }
  return { kind: "unknown" };
}

export interface ActivityListSummary {
  total?: number;
  page?: number;
  pagelen?: number;
  next?: string;
  values: ActivityRow[];
}

export function activityListSummary(raw: unknown): ActivityListSummary {
  const r = raw as BitbucketPaginated<BitbucketActivityEntry>;
  return {
    total: r.size,
    page: r.page,
    pagelen: r.pagelen,
    next: r.next,
    values: (r.values ?? []).map(activityRow),
  };
}

// --- Mutation ack -----------------------------------------------------

// Trim projection for write actions (approve, merge, decline, comment
// create/update/delete). Bitbucket's write endpoints return the full
// resource by default — gigabytes of noise the agent rarely needs.
// We project to the few fields that confirm the mutation succeeded,
// using the SDK's configurable factory. Empty 204 responses collapse
// to `{ ok: true }`.

export const mutationAck = createMutationAck({
  pick: ["id", "state", "title", "approved"],
  liftPaths: { merge_commit: "merge_commit.hash" },
});

// --- Generic list (fallback) ------------------------------------------

// For endpoints we don't have an entity-specific row for, fall back to
// the SDK's count-only summary. Use sparingly — most Bitbucket
// endpoints have a small row shape worth inlining.
export const genericListSummary = (raw: unknown) => paginatedListSummary(raw);
