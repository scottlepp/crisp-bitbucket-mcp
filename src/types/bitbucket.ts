// Bitbucket Cloud REST API response shapes.
//
// Minimal — we only declare fields we actually project in trim
// functions. Anything we drop in projection doesn't need a type. The
// full raw response always lands on disk via sandbox, so a missing
// field type doesn't lose information; it just means the trim layer
// can't reference that field by name.

// --- Account / user ---------------------------------------------------

export interface BitbucketAccount {
  uuid: string;
  display_name: string;
  account_id?: string;
  nickname?: string;
  type?: "user" | "team";
}

// --- Branch reference -------------------------------------------------

export interface BitbucketBranchRef {
  branch: { name: string };
  commit?: { hash: string; type?: string };
  repository?: { uuid: string; name: string; full_name: string };
}

// --- Pull request -----------------------------------------------------

export type BitbucketPullRequestState =
  | "OPEN"
  | "MERGED"
  | "DECLINED"
  | "SUPERSEDED";

export interface BitbucketReviewer {
  uuid: string;
  display_name: string;
}

export interface BitbucketParticipant {
  user: BitbucketAccount;
  role: "PARTICIPANT" | "REVIEWER";
  approved: boolean;
  state?: "approved" | "changes_requested" | null;
  // ISO timestamp of the participant's last action (approval, etc.).
  participated_on?: string;
}

export interface BitbucketPullRequest {
  id: number;
  title: string;
  description?: string;
  state: BitbucketPullRequestState;
  author: BitbucketAccount;
  source: BitbucketBranchRef;
  destination: BitbucketBranchRef;
  created_on: string;
  updated_on: string;
  // Counts present on `/pullrequests/{id}` but not always on list rows.
  comment_count?: number;
  task_count?: number;
  reviewers?: BitbucketAccount[];
  participants?: BitbucketParticipant[];
  // `closed_by` populated on MERGED/DECLINED; null on OPEN.
  closed_by?: BitbucketAccount | null;
  // Closed PRs only.
  merge_commit?: { hash: string } | null;
  // Bitbucket renders both raw and HTML; we prefer raw markdown.
  summary?: { raw?: string; markup?: string; html?: string };
  rendered?: {
    title?: { raw?: string; html?: string };
    description?: { raw?: string; html?: string };
  };
  // Map of typed link arrays. Verbose; we drop in projection.
  links?: Record<string, unknown>;
}

// --- Comment ----------------------------------------------------------

export interface BitbucketComment {
  id: number;
  user: BitbucketAccount;
  content: {
    raw?: string;
    markup?: string;
    html?: string;
  };
  created_on: string;
  updated_on?: string;
  // Inline comments carry file/line; general comments don't.
  inline?: {
    path: string;
    from?: number | null;
    to?: number | null;
  };
  // Parent comment id (replies). null on top-level comments.
  parent?: { id: number } | null;
  // True when an admin/author has resolved this thread.
  resolution?: {
    user: BitbucketAccount;
    created_on: string;
  } | null;
  // True when the comment was deleted (Bitbucket leaves tombstones).
  deleted?: boolean;
  pullrequest?: { id: number };
  links?: Record<string, unknown>;
}

// --- Repository -------------------------------------------------------

export interface BitbucketRepository {
  uuid: string;
  name: string;
  full_name: string;
  description?: string;
  is_private: boolean;
  fork_policy?: string;
  language?: string;
  size?: number;
  created_on: string;
  updated_on: string;
  mainbranch?: { name: string; type?: string };
  owner?: BitbucketAccount;
  workspace?: { uuid: string; name: string; slug: string };
  project?: { uuid: string; key: string; name: string };
  links?: Record<string, unknown>;
}

// --- Commit -----------------------------------------------------------

export interface BitbucketCommit {
  hash: string;
  message: string;
  date: string;
  author: {
    raw: string; // "Name <email>"
    user?: BitbucketAccount;
  };
  parents?: Array<{ hash: string; type?: string }>;
  repository?: { uuid: string; name: string; full_name: string };
  summary?: { raw?: string; html?: string };
  links?: Record<string, unknown>;
}

// --- Paginated list envelope -----------------------------------------

export interface BitbucketPaginated<T> {
  pagelen?: number;
  page?: number;
  size?: number;
  next?: string;
  previous?: string;
  values: T[];
}

// --- Error response ---------------------------------------------------

export interface BitbucketErrorResponse {
  type?: "error";
  error?: {
    message: string;
    detail?: string;
    data?: unknown;
    id?: string;
  };
}
