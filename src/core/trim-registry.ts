// Trim registry keyed by manifest `trim:` string.
//
// Operations in operations.ts reference these by string key
// ("pullrequest", "pullrequestList", etc.). Add entries here when
// adding new ops; the manifest test verifies every `op.trim` value
// exists in this registry.

import { createTrimRegistry, type TrimFn } from "@scottlepp/mcp-toolkit/trim-registry";

import {
  accountListSummary,
  accountSummary,
  activityListSummary,
  branchingModelSummary,
  branchingSettingsSummary,
  commentListSummary,
  commentSummary,
  commitListSummary,
  commitStatusListSummary,
  commitSummary,
  genericListSummary,
  mutationAck,
  pipelineRunListSummary,
  pipelineRunSummary,
  pipelineStepListSummary,
  pipelineStepSummary,
  pullRequestListSummary,
  pullRequestSummary,
  repositoryListSummary,
  repositorySummary,
  taskListSummary,
  taskSummary,
  workspaceListSummary,
  workspaceMemberListSummary,
  workspaceSummary,
} from "./trim.js";

export const trimRegistry = createTrimRegistry({
  pullrequest: pullRequestSummary as TrimFn,
  pullrequestList: pullRequestListSummary as TrimFn,
  repository: repositorySummary as TrimFn,
  repositoryList: repositoryListSummary as TrimFn,
  commit: commitSummary as TrimFn,
  commitList: commitListSummary as TrimFn,
  commitStatusList: commitStatusListSummary as TrimFn,
  comment: commentSummary as TrimFn,
  commentList: commentListSummary as TrimFn,
  account: (a: unknown) => accountSummary(a as never),
  accountList: accountListSummary as TrimFn,
  workspace: workspaceSummary as TrimFn,
  workspaceList: workspaceListSummary as TrimFn,
  workspaceMemberList: workspaceMemberListSummary as TrimFn,
  pipelineRun: pipelineRunSummary as TrimFn,
  pipelineRunList: pipelineRunListSummary as TrimFn,
  pipelineStep: pipelineStepSummary as TrimFn,
  pipelineStepList: pipelineStepListSummary as TrimFn,
  branchingModel: branchingModelSummary as TrimFn,
  branchingSettings: branchingSettingsSummary as TrimFn,
  task: taskSummary as TrimFn,
  taskList: taskListSummary as TrimFn,
  activityList: activityListSummary as TrimFn,
  // Returned by write actions (approve/merge/decline/comment-write).
  // Compact { ok, id?, state?, title?, approved?, merge_commit? }.
  ack: mutationAck as TrimFn,
  // Fallback for ops we haven't entity-typed yet.
  list: genericListSummary as TrimFn,
});

export type TrimKey = keyof typeof trimRegistry;
