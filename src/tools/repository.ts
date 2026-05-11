// bitbucket_repository — consolidated repo tool.
//
// Phase 1 surface: get, list. Phase 3 extends to default-reviewers.

import { z } from "zod";

import type { ConsolidatedToolDef } from "./dispatcher.js";

const GetSchema = z.object({
  workspace: z.string().optional(),
  repo_slug: z.string().describe("Repository slug"),
});

const ListSchema = z.object({
  workspace: z.string().optional(),
  q: z.string().optional().describe('BBQL filter. E.g. `name~"foo"`'),
  sort: z
    .string()
    .optional()
    .describe("Sort field. Prefix with `-` for descending."),
  role: z
    .enum(["owner", "admin", "contributor", "member"])
    .optional()
    .describe(
      "Filter to repos where the authenticated user has this role or higher",
    ),
  page: z.coerce.number().int().positive().optional(),
  pagelen: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Items per page (max 100; default 10)"),
});

export const repositoryTool: ConsolidatedToolDef = {
  name: "bitbucket_repository",
  description:
    "Read repositories. Actions: `get` (one repo), `list` (paginated). " +
    "Returns compact summaries; full responses are cached server-side.",
  actions: {
    get: {
      operation: "repository.get",
      schema: GetSchema,
      description: "Fetch one repository's metadata",
    },
    list: {
      operation: "repository.list",
      schema: ListSchema,
      description: "List repositories in a workspace (paginated, filterable)",
    },
  },
};
