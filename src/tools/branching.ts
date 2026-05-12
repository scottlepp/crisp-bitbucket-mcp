// bitbucket_branching — consolidated branching-model tool.
//
// Branching model declares conventions (feature/<*>, hotfix/<*>, etc.)
// and dev/prod branches. Settings adds enabled flags per type. The
// `effective` action resolves repo + project + inherited defaults.
//
// Update actions accept the same body shape Bitbucket returns; we
// don't reshape because the contract is already well-typed and
// callers rarely change more than one field at a time.

import { z } from "zod";

import type { ConsolidatedToolDef } from "@scottlepp/mcp-toolkit/tool";

const repoTarget = {
  workspace: z.string().optional(),
  repo_slug: z.string().describe("Repository slug"),
};

const projectTarget = {
  workspace: z.string().optional(),
  project_key: z.string().describe("Project key (e.g. `BACKEND`)"),
};

// Common Body shape for update actions. All fields optional — pass
// only what you want to change.
const settingsUpdateBody = {
  branch_types: z
    .array(
      z.object({
        kind: z
          .enum([
            "feature",
            "bugfix",
            "hotfix",
            "release",
            "task",
            "custom",
          ])
          .describe("Branch kind"),
        enabled: z.boolean().optional(),
        prefix: z
          .string()
          .optional()
          .describe('Branch prefix, e.g. "feature/"'),
      }),
    )
    .optional()
    .describe("Per-type configuration to update"),
  development: z
    .object({
      name: z.string().optional().describe("Dev branch name (alternative to use_mainbranch)"),
      use_mainbranch: z.boolean().optional(),
    })
    .optional(),
  production: z
    .object({
      enabled: z.boolean().optional(),
      name: z.string().optional(),
      use_mainbranch: z.boolean().optional(),
    })
    .optional(),
};

const RepoModelSchema = z.object({ ...repoTarget });
const RepoSettingsSchema = z.object({ ...repoTarget });
const RepoSettingsUpdateSchema = z.object({ ...repoTarget, ...settingsUpdateBody });
const RepoEffectiveSchema = z.object({ ...repoTarget });
const ProjectModelSchema = z.object({ ...projectTarget });
const ProjectSettingsSchema = z.object({ ...projectTarget });
const ProjectSettingsUpdateSchema = z.object({ ...projectTarget, ...settingsUpdateBody });

export const branchingTool: ConsolidatedToolDef = {
  name: "bitbucket_branching",
  description:
    "Read and manage branching-model conventions. Actions: `repo_model`, `repo_settings`, " +
    "`repo_settings_update`, `repo_effective` (resolved repo + project + defaults); " +
    "`project_model`, `project_settings`, `project_settings_update`.",
  actions: {
    repo_model: {
      operation: "branching.repo_model",
      schema: RepoModelSchema,
      description: "Fetch the repo's branching model (branch types, dev/prod branches)",
    },
    repo_settings: {
      operation: "branching.repo_settings",
      schema: RepoSettingsSchema,
      description: "Fetch repo-level branching-model settings (enabled flags per branch type)",
    },
    repo_settings_update: {
      operation: "branching.repo_settings_update",
      schema: RepoSettingsUpdateSchema,
      description: "Update repo-level branching-model settings",
    },
    repo_effective: {
      operation: "branching.repo_effective",
      schema: RepoEffectiveSchema,
      description: "Fetch the effective branching model (resolved across repo/project/defaults)",
    },
    project_model: {
      operation: "branching.project_model",
      schema: ProjectModelSchema,
      description: "Fetch the project's branching model",
    },
    project_settings: {
      operation: "branching.project_settings",
      schema: ProjectSettingsSchema,
      description: "Fetch project-level branching-model settings",
    },
    project_settings_update: {
      operation: "branching.project_settings_update",
      schema: ProjectSettingsUpdateSchema,
      description: "Update project-level branching-model settings",
    },
  },
};
