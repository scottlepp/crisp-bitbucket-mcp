// bitbucket_repository — consolidated repo tool.
//
// Phase 1 surface: get, list. Phase 3 extends to default-reviewers.

import { z } from "zod";

import { invokeOperation } from "@scottlepp/mcp-toolkit/manifest";

import type { ConsolidatedToolDef, DispatcherContext } from "./dispatcher.js";
import { positiveInt } from "./schemas.js";

const GetSchema = z.object({
  workspace: z.string().optional(),
  repo_slug: z.string().describe("Repository slug"),
});

const DefaultReviewersSchema = z.object({
  workspace: z.string().optional(),
  repo_slug: z.string().describe("Repository slug"),
  effective: z
    .boolean()
    .optional()
    .describe(
      "When true, return the resolved (repo + project + inherited) list. Default false (repo-level only).",
    ),
  page: positiveInt.optional(),
  pagelen: positiveInt.pipe(z.number().max(100)).optional(),
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
  page: positiveInt.optional(),
  pagelen: positiveInt
    .pipe(z.number().max(100))
    .optional()
    .describe("Items per page (max 100; default 10)"),
});

// `default_reviewers` dispatches between repo-level and effective
// (repo + project + inherited) endpoints based on the `effective`
// flag. A custom handler keeps the user-facing action count down to
// one — `effective: true` is the override.
const defaultReviewersHandler = async (
  args: Record<string, unknown>,
  ctx: DispatcherContext,
): Promise<unknown> => {
  const a = args as {
    workspace?: string;
    repo_slug: string;
    effective?: boolean;
    page?: number;
    pagelen?: number;
  };
  const operation = a.effective
    ? "repository.effective_default_reviewers"
    : "repository.default_reviewers";
  const finalArgs: Record<string, unknown> = {
    workspace: a.workspace,
    repo_slug: a.repo_slug,
    page: a.page,
    pagelen: a.pagelen,
  };
  const withDefault = ctx.preprocess
    ? ctx.preprocess(operation, finalArgs)
    : finalArgs;
  return invokeOperation(
    ctx.manifest,
    ctx.client,
    operation,
    withDefault,
    ctx.trimRegistry,
    ctx.invokeOptions,
  );
};

export const repositoryTool: ConsolidatedToolDef = {
  name: "bitbucket_repository",
  description:
    "Read repositories and default reviewers. Actions: `get`, `list`, " +
    "`default_reviewers` (pass `effective: true` for the resolved repo + project list).",
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
    default_reviewers: {
      schema: DefaultReviewersSchema,
      description:
        "List default reviewers for a repo (pass effective:true for the resolved list)",
      handler: defaultReviewersHandler,
    },
  },
};
