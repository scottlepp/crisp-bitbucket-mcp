// bitbucket_pullrequest — consolidated PR tool.
//
// Phase 1 surface: get, list. Phase 3 extends to create/update/merge/
// decline/approve/comment operations.

import { z } from "zod";

import type { ConsolidatedToolDef } from "./dispatcher.js";
import { positiveInt } from "./schemas.js";

const GetSchema = z.object({
  workspace: z.string().optional(),
  repo_slug: z.string().describe("Repository slug"),
  pr_id: positiveInt.describe("Pull request id (number or numeric string, e.g. 39636 or \"39636\")"),
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

export const pullRequestTool: ConsolidatedToolDef = {
  name: "bitbucket_pullrequest",
  description:
    "Read pull requests. Actions: `get` (one PR), `list` (paginated). " +
    "Returns trimmed summaries; the full response is cached server-side " +
    "and accessible via code-api mode if you need raw fields.",
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
  },
};
