// Entity-specific trim projections for Bitbucket Cloud responses.
//
// The full untrimmed response always lands on disk via the SDK's
// sandbox; these summaries are what surfaces in-band. Aggressive
// allowlist-style projections — drop links, avatars, deeply-nested
// repository duplicates, rendered.html duplicates of raw markdown.

import { paginatedListSummary, pick } from "@scottlepp/mcp-toolkit/trim";

import type {
  BitbucketAccount,
  BitbucketBranchRef,
  BitbucketComment,
  BitbucketCommit,
  BitbucketParticipant,
  BitbucketPaginated,
  BitbucketPullRequest,
  BitbucketRepository,
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

// --- Mutation ack -----------------------------------------------------

// Trim projection for write actions (approve, merge, decline, comment
// create/update/delete). Bitbucket's write endpoints return the full
// resource by default — gigabytes of noise the agent rarely needs.
// This trim returns the few fields that confirm the mutation
// succeeded: `id` (which thing was touched), `state` (its new state),
// and a couple of common signals (`approved`, `merge_commit`). Empty
// 204 responses get `{ ok: true }`.
//
// Pattern lifted from b1ff/atlassian-dc-mcp's `shapePullRequestAck`.

export interface MutationAck {
  ok: true;
  id?: number;
  state?: string;
  title?: string;
  approved?: boolean;
  merge_commit?: string;
}

export function mutationAck(raw: unknown): MutationAck {
  if (!raw || typeof raw !== "object") return { ok: true };
  const r = raw as {
    id?: unknown;
    state?: unknown;
    title?: unknown;
    approved?: unknown;
    merge_commit?: { hash?: unknown } | null;
  };
  const out: MutationAck = { ok: true };
  if (typeof r.id === "number") out.id = r.id;
  if (typeof r.state === "string") out.state = r.state;
  if (typeof r.title === "string") out.title = r.title;
  if (typeof r.approved === "boolean") out.approved = r.approved;
  if (r.merge_commit && typeof r.merge_commit.hash === "string") {
    out.merge_commit = r.merge_commit.hash;
  }
  return out;
}

// --- Generic list (fallback) ------------------------------------------

// For endpoints we don't have an entity-specific row for, fall back to
// the SDK's count-only summary. Use sparingly — most Bitbucket
// endpoints have a small row shape worth inlining.
export const genericListSummary = (raw: unknown) => paginatedListSummary(raw);
