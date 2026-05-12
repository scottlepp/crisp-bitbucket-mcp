// bitbucket_commit — consolidated commit tool.
//
// Actions: get (one commit), list (commits on a branch), statuses
// (build/CI statuses on a commit). Statuses is the most commonly-
// scripted action — "is this commit green?" — and the trim projects
// down to the few fields that answer it.

import { z } from "zod";

import type { ConsolidatedToolDef } from "./dispatcher.js";
import { positiveInt } from "./schemas.js";

const commitTargetFields = {
  workspace: z.string().optional(),
  repo_slug: z.string().describe("Repository slug"),
  commit_hash: z.string().describe("Full or short commit hash"),
};

const GetSchema = z.object({ ...commitTargetFields });

const ListSchema = z.object({
  workspace: z.string().optional(),
  repo_slug: z.string().describe("Repository slug"),
  include: z
    .string()
    .optional()
    .describe("Comma-separated refs to walk from (default: main branch)"),
  exclude: z
    .string()
    .optional()
    .describe("Comma-separated refs to subtract from the walk"),
  page: positiveInt.optional(),
  pagelen: positiveInt
    .pipe(z.number().max(100))
    .optional()
    .describe("Items per page (max 100; default 30)"),
});

const StatusesSchema = z.object({
  ...commitTargetFields,
  q: z
    .string()
    .optional()
    .describe('BBQL filter (e.g. `state="FAILED"`)'),
  page: positiveInt.optional(),
  pagelen: positiveInt.pipe(z.number().max(100)).optional(),
});

export const commitTool: ConsolidatedToolDef = {
  name: "bitbucket_commit",
  description:
    "Read commits and their CI/build statuses. Actions: `get`, `list`, `statuses` " +
    "(useful for ship-readiness checks: is this commit green across all build systems).",
  actions: {
    get: {
      operation: "commit.get",
      schema: GetSchema,
      description: "Fetch one commit by hash",
    },
    list: {
      operation: "commit.list",
      schema: ListSchema,
      description: "List commits on a branch or ref",
    },
    statuses: {
      operation: "commit.statuses",
      schema: StatusesSchema,
      description: "Build/CI statuses reported against a commit",
    },
  },
};
