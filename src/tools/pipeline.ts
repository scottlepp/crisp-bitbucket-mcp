// bitbucket_pipeline — consolidated pipeline tool.
//
// Six standard actions go through the manifest dispatcher (list_runs,
// get_run, run, stop, steps_list, step_get). `step_logs` is special:
// the endpoint returns text/plain (not JSON) and the response can be
// multi-MB, so the action uses the dispatcher's `handler` hook to
// fetch + filter server-side via `core/pipeline/log-filter.ts`. The
// agent gets bounded, line-numbered output and a truncation marker
// when filters cap the result.

import { z } from "zod";

import type { BitbucketClient } from "../auth/bitbucket-client.js";
import { filterLog } from "../core/pipeline/log-filter.js";
import type { ConsolidatedToolDef, DispatcherContext, ToolAction } from "./dispatcher.js";
import { nonNegativeInt, positiveInt } from "./schemas.js";

// Common identifying fields.
const repoTarget = {
  workspace: z.string().optional(),
  repo_slug: z.string().describe("Repository slug"),
};

const pipelineTarget = {
  ...repoTarget,
  pipeline_uuid: z.string().describe("Pipeline run uuid (with curly braces)"),
};

const stepTarget = {
  ...pipelineTarget,
  step_uuid: z.string().describe("Pipeline step uuid (with curly braces)"),
};

const ListRunsSchema = z.object({
  ...repoTarget,
  q: z
    .string()
    .optional()
    .describe('BBQL filter (e.g. `target.ref_name="main"`)'),
  sort: z.string().optional().describe("Default `-created_on`"),
  page: positiveInt.optional(),
  pagelen: positiveInt.pipe(z.number().max(100)).optional(),
});

const GetRunSchema = z.object({ ...pipelineTarget });

const RunSchema = z
  .object({
    ...repoTarget,
    ref_name: z
      .string()
      .describe("Branch / tag name to run against (e.g. `main`, `v1.2.3`)"),
    ref_type: z
      .enum(["branch", "tag"])
      .default("branch")
      .describe("Whether `ref_name` is a branch or tag (default: branch)"),
    selector_type: z
      .enum(["custom", "default", "pull-requests", "branches", "tags"])
      .optional()
      .describe("Pipeline selector (omit for the repo default)"),
    selector_pattern: z
      .string()
      .optional()
      .describe("Custom pipeline name when selector_type=custom"),
    variables: z
      .array(
        z.object({
          key: z.string(),
          value: z.string(),
          secured: z.boolean().optional(),
        }),
      )
      .optional()
      .describe("Pipeline variable overrides"),
  })
  .transform((data) => {
    // Bitbucket Cloud body shape:
    //   target: {
    //     type: "pipeline_ref_target",
    //     ref_type, ref_name,
    //     selector?: { type, pattern? }
    //   },
    //   variables?: [...]
    const target: Record<string, unknown> = {
      type: "pipeline_ref_target",
      ref_type: data.ref_type,
      ref_name: data.ref_name,
    };
    if (data.selector_type !== undefined) {
      const selector: Record<string, unknown> = { type: data.selector_type };
      if (data.selector_pattern !== undefined) selector.pattern = data.selector_pattern;
      target.selector = selector;
    }
    const out: Record<string, unknown> = {
      workspace: data.workspace,
      repo_slug: data.repo_slug,
      target,
    };
    if (data.variables !== undefined) out.variables = data.variables;
    return out;
  });

const StopSchema = z.object({ ...pipelineTarget });

const StepsListSchema = z.object({
  ...pipelineTarget,
  page: positiveInt.optional(),
  pagelen: positiveInt.pipe(z.number().max(100)).optional(),
});

const StepGetSchema = z.object({ ...stepTarget });

const StepLogsSchema = z.object({
  ...stepTarget,
  errors_only: z
    .boolean()
    .optional()
    .describe("Return only lines matching error heuristics (error / failed / exception / panic / etc.)"),
  grep: z
    .string()
    .optional()
    .describe("Pattern: substring, regex, or /pattern/flags. Case-insensitive by default."),
  context_lines: nonNegativeInt
    .optional()
    .describe("Lines before/after each grep match. Default 2."),
  tail: positiveInt
    .optional()
    .describe("Return only the last N filtered lines (apply after errors_only/grep)."),
  max_lines: positiveInt
    .optional()
    .describe("Hard cap on returned lines. Default 500."),
});

// --- step_logs custom handler ----------------------------------------

// Bitbucket Cloud's step-logs endpoint redirects (302) to a signed
// CDN URL with `Content-Type: text/plain`. Our HTTP client follows
// redirects automatically (the same fix we applied for diff); we just
// need to ask for text instead of JSON.

const STEP_LOGS_PATH = (
  workspace: string,
  repoSlug: string,
  pipelineUuid: string,
  stepUuid: string,
): string =>
  `/repositories/${workspace}/${repoSlug}/pipelines/${pipelineUuid}/steps/${stepUuid}/log`;

interface StepLogsArgs {
  workspace: string;
  repo_slug: string;
  pipeline_uuid: string;
  step_uuid: string;
  errors_only?: boolean;
  grep?: string;
  context_lines?: number;
  tail?: number;
  max_lines?: number;
}

const stepLogsHandler: ToolAction["handler"] = async (args, ctx: DispatcherContext) => {
  const a = args as unknown as StepLogsArgs;
  // The BitbucketClient adapter implements getText (text/plain mode).
  // SDK Client interface doesn't include getText; narrow the cast
  // here since this handler is bitbucket-specific.
  const client = ctx.client as unknown as BitbucketClient;
  const raw = await client.getText(
    STEP_LOGS_PATH(a.workspace, a.repo_slug, a.pipeline_uuid, a.step_uuid),
  );
  return filterLog(raw, {
    errors_only: a.errors_only,
    grep: a.grep,
    context_lines: a.context_lines,
    tail: a.tail,
    max_lines: a.max_lines,
  });
};

export const pipelineTool: ConsolidatedToolDef = {
  name: "bitbucket_pipeline",
  description:
    "Read and trigger pipelines. Actions: `list_runs`, `get_run`, `run` (trigger), `stop`, " +
    "`steps_list`, `step_get`, `step_logs` (with server-side errors_only/grep/tail/max_lines filtering).",
  actions: {
    list_runs: {
      operation: "pipeline.list_runs",
      schema: ListRunsSchema,
      description: "List pipeline runs in a repository",
    },
    get_run: {
      operation: "pipeline.get_run",
      schema: GetRunSchema,
      description: "Fetch one pipeline run by uuid",
    },
    run: {
      operation: "pipeline.run",
      schema: RunSchema,
      description: "Trigger a new pipeline run on a branch/tag",
    },
    stop: {
      operation: "pipeline.stop",
      schema: StopSchema,
      description: "Stop a running pipeline",
    },
    steps_list: {
      operation: "pipeline.steps_list",
      schema: StepsListSchema,
      description: "List steps for a pipeline run",
    },
    step_get: {
      operation: "pipeline.step_get",
      schema: StepGetSchema,
      description: "Fetch one pipeline step",
    },
    step_logs: {
      // No `operation` — custom handler bypasses the manifest path.
      schema: StepLogsSchema,
      description:
        "Fetch a step's log with server-side filtering. Pass errors_only / grep / tail / max_lines to bound output.",
      handler: stepLogsHandler,
    },
  },
};
