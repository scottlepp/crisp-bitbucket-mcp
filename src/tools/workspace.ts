// bitbucket_workspace — consolidated workspace tool.
//
// Actions: list (workspaces you belong to), get (one workspace),
// members (workspace member roster — useful for discovering reviewers).

import { z } from "zod";

import type { ConsolidatedToolDef } from "./dispatcher.js";
import { positiveInt } from "./schemas.js";

const ListSchema = z.object({
  q: z
    .string()
    .optional()
    .describe("BBQL filter (e.g. `is_private=true`)"),
  sort: z.string().optional(),
  role: z
    .enum(["owner", "collaborator", "member"])
    .optional()
    .describe("Filter to workspaces where you have this role or higher"),
  page: positiveInt.optional(),
  pagelen: positiveInt.pipe(z.number().max(100)).optional(),
});

const GetSchema = z.object({
  workspace: z.string().describe("Workspace slug"),
});

const MembersSchema = z.object({
  workspace: z.string().describe("Workspace slug"),
  q: z.string().optional(),
  page: positiveInt.optional(),
  pagelen: positiveInt.pipe(z.number().max(100)).optional(),
});

export const workspaceTool: ConsolidatedToolDef = {
  name: "bitbucket_workspace",
  description:
    "Read workspace info. Actions: `list` (workspaces you belong to), " +
    "`get` (one workspace), `members` (roster — useful for finding reviewers).",
  actions: {
    list: {
      operation: "workspace.list",
      schema: ListSchema,
      description: "List workspaces the authenticated user belongs to",
    },
    get: {
      operation: "workspace.get",
      schema: GetSchema,
      description: "Fetch a workspace's metadata",
    },
    members: {
      operation: "workspace.members",
      schema: MembersSchema,
      description: "List members of a workspace",
    },
  },
};
