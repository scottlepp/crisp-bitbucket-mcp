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
  // Fields on /user and /users/{selected_user}; absent on most embedded
  // account references.
  created_on?: string;
  has_2fa_enabled?: boolean;
  location?: string;
}

// --- Workspace --------------------------------------------------------

export interface BitbucketWorkspace {
  uuid: string;
  slug: string;
  name: string;
  is_private: boolean;
  type?: string;
  created_on: string;
  links?: Record<string, unknown>;
}

export interface BitbucketWorkspaceMembership {
  // /workspaces/{w}/members rows. `user` is the account; `workspace`
  // contains slug+name; `permission` is owner|admin|member|collaborator.
  user: BitbucketAccount;
  workspace?: { slug: string; name: string };
  permission?: string;
  links?: Record<string, unknown>;
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

// --- Pull request task -----------------------------------------------

export interface BitbucketTask {
  id: number;
  state: "RESOLVED" | "UNRESOLVED";
  content: { raw?: string; markup?: string; html?: string };
  creator: BitbucketAccount;
  created_on: string;
  updated_on?: string;
  resolved_on?: string | null;
  resolved_by?: BitbucketAccount | null;
  // For inline tasks (rare).
  comment?: { id: number };
}

// --- Pull request activity --------------------------------------------

// Activity entries are heterogeneous: each row carries `pull_request`
// plus one of `approval`, `comment`, `update`, `changes_requested`,
// `unapproval`, etc. We discriminate at trim time and project a flat
// row shape.

export interface BitbucketActivityEntry {
  pull_request?: { id: number; title?: string };
  approval?: { date: string; user: BitbucketAccount };
  unapproval?: { date: string; user: BitbucketAccount };
  changes_requested?: { date: string; user: BitbucketAccount };
  changes_request_removal?: { date: string; user: BitbucketAccount };
  comment?: BitbucketComment;
  update?: {
    date: string;
    state?: string;
    title?: string;
    description?: string;
    author?: BitbucketAccount;
  };
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

// --- Pipeline ---------------------------------------------------------

// Bitbucket Cloud pipeline objects nest `state` as either
// `{name: "IN_PROGRESS"}` or `{name: "COMPLETED", result: {name: "SUCCESSFUL"}}`.
// We flatten both into `state` (raw name) + `result` (raw name when present)
// in the trim layer.

export interface BitbucketPipelineState {
  name: string;
  type?: string;
  result?: { name: string; type?: string };
  stage?: { name: string };
}

export interface BitbucketPipelineRun {
  uuid: string;
  build_number: number;
  state: BitbucketPipelineState;
  trigger?: { type?: string; name?: string };
  target?: {
    type?: string;
    ref_name?: string;
    ref_type?: string;
    commit?: { hash: string };
    selector?: { type?: string; pattern?: string };
  };
  creator?: BitbucketAccount;
  created_on?: string;
  completed_on?: string;
  duration_in_seconds?: number;
  build_seconds_used?: number;
  run_number?: number;
}

export interface BitbucketPipelineStep {
  uuid: string;
  name?: string;
  state: BitbucketPipelineState;
  trigger?: { type?: string };
  started_on?: string;
  completed_on?: string;
  duration_in_seconds?: number;
  build_seconds_used?: number;
  run_number?: number;
  pipeline?: { uuid: string };
  setup_commands?: unknown[];
  script_commands?: unknown[];
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
