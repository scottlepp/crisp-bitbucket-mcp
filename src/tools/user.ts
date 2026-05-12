// bitbucket_user — consolidated user tool.
//
// Bitbucket Cloud's public surface here is small: who am I (`me`) and
// look up a user by uuid/account_id (`get`). The legacy `/users/search`
// endpoint was deprecated in 2018; there's no general search.

import { z } from "zod";

import type { ConsolidatedToolDef } from "./dispatcher.js";

const MeSchema = z.object({});

const GetSchema = z.object({
  selected_user: z
    .string()
    .describe(
      'User uuid (with curly braces, e.g. "{abc-123-...}") or account_id',
    ),
});

export const userTool: ConsolidatedToolDef = {
  name: "bitbucket_user",
  description:
    "Read user info. Actions: `me` (authenticated user), `get` (by uuid or account_id). " +
    "Bitbucket Cloud doesn't expose general user search — use workspace.members for discovery.",
  actions: {
    me: {
      operation: "user.me",
      schema: MeSchema,
      description: "Fetch the authenticated user",
    },
    get: {
      operation: "user.get",
      schema: GetSchema,
      description: "Fetch a user by uuid or account_id",
    },
  },
};
