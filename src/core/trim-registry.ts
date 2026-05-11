// Trim registry keyed by manifest `trim:` string.
//
// Operations in operations.ts reference these by string key
// ("pullrequest", "pullrequestList", etc.). Add entries here when
// adding new ops; the manifest test verifies every `op.trim` value
// exists in this registry.

import { createTrimRegistry, type TrimFn } from "@scottlepp/mcp-toolkit/trim-registry";

import {
  commentListSummary,
  commentSummary,
  commitListSummary,
  commitSummary,
  genericListSummary,
  pullRequestListSummary,
  pullRequestSummary,
  repositoryListSummary,
  repositorySummary,
} from "./trim.js";

export const trimRegistry = createTrimRegistry({
  pullrequest: pullRequestSummary as TrimFn,
  pullrequestList: pullRequestListSummary as TrimFn,
  repository: repositorySummary as TrimFn,
  repositoryList: repositoryListSummary as TrimFn,
  commit: commitSummary as TrimFn,
  commitList: commitListSummary as TrimFn,
  comment: commentSummary as TrimFn,
  commentList: commentListSummary as TrimFn,
  // Fallback for ops we haven't entity-typed yet.
  list: genericListSummary as TrimFn,
});

export type TrimKey = keyof typeof trimRegistry;
