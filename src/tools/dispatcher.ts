// Generic dispatcher for consolidated MCP tools.
//
// Each consolidated tool (bitbucket_pullrequest, bitbucket_repository,
// ...) follows the same shape: an `action` discriminator on input, a
// per-action Zod schema, and a manifest operation it routes to. This
// module factors out the common dispatch logic.

import { z, type ZodTypeAny } from "zod";

import {
  invokeOperation,
  type InvokeOptions,
  type Manifest,
} from "@scottlepp/mcp-toolkit/manifest";
import type { Client } from "@scottlepp/mcp-toolkit/client";
import type { TrimRegistry } from "@scottlepp/mcp-toolkit/trim-registry";

export interface ToolAction {
  // Manifest operation name (`pullrequest.get`, etc.).
  operation: string;
  // Per-action Zod schema. Validates and coerces flat args after the
  // dispatcher strips the `action` discriminator. Optional — actions
  // without input beyond the discriminator pass z.object({}).
  schema?: ZodTypeAny;
  // Per-action description rendered in tool listing JSON.
  description: string;
}

export interface ConsolidatedToolDef {
  name: string;
  description: string;
  actions: Record<string, ToolAction>;
}

export interface DispatcherContext {
  manifest: Manifest;
  client: Client;
  trimRegistry: TrimRegistry;
  invokeOptions?: InvokeOptions;
  // Pre-process resolved args before dispatch (e.g. inject default
  // workspace from BitbucketConfig). Returns the new args. Identity
  // by default.
  preprocess?: (operation: string, args: Record<string, unknown>) => Record<string, unknown>;
}

// Build the MCP tool input schema as a JSON Schema-ish object:
// `{ action: enum, ...union of action arg shapes }`. We use a flat
// discriminated approach (action keys + flat args) because MCP
// clients render discriminated unions poorly.
export function buildInputSchema(tool: ConsolidatedToolDef) {
  const actionNames = Object.keys(tool.actions);
  return {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: actionNames,
        description: Object.entries(tool.actions)
          .map(([name, a]) => `\`${name}\`: ${a.description}`)
          .join(" | "),
      },
    },
    required: ["action"],
    additionalProperties: true,
  } as const;
}

export interface DispatchResult {
  // The trimmed projection of the operation's response.
  result: unknown;
}

export class DispatchError extends Error {
  constructor(message: string, public readonly action: string) {
    super(message);
    this.name = "DispatchError";
  }
}

// Dispatch one tool invocation. Validates the action, parses
// per-action args via the action's schema, applies the optional
// preprocess hook, and routes through the SDK's `invokeOperation`.
export async function dispatch(
  tool: ConsolidatedToolDef,
  rawArgs: unknown,
  ctx: DispatcherContext,
): Promise<DispatchResult> {
  if (!rawArgs || typeof rawArgs !== "object") {
    throw new DispatchError(
      `${tool.name}: expected an object input with an "action" field; got ${typeof rawArgs}`,
      "",
    );
  }
  const argsObj = rawArgs as Record<string, unknown>;
  const actionName = argsObj.action;
  if (typeof actionName !== "string") {
    throw new DispatchError(
      `${tool.name}: missing required "action" field (one of: ${Object.keys(tool.actions).join(", ")})`,
      "",
    );
  }
  const action = tool.actions[actionName];
  if (!action) {
    throw new DispatchError(
      `${tool.name}: unknown action "${actionName}". Valid: ${Object.keys(tool.actions).join(", ")}`,
      actionName,
    );
  }

  // Strip the action discriminator, then validate the rest.
  const { action: _drop, ...flatArgs } = argsObj;
  let validated: Record<string, unknown> = flatArgs;
  if (action.schema) {
    const parsed = action.schema.safeParse(flatArgs);
    if (!parsed.success) {
      // Zod's `prettifyError` lands the issue list in a compact form
      // the agent can act on. Fallback to JSON in case of older zod.
      const detail = z.prettifyError(parsed.error);
      throw new DispatchError(
        `${tool.name}.${actionName}: invalid args:\n${detail}`,
        actionName,
      );
    }
    validated = parsed.data as Record<string, unknown>;
  }

  const finalArgs = ctx.preprocess
    ? ctx.preprocess(action.operation, validated)
    : validated;

  const result = await invokeOperation(
    ctx.manifest,
    ctx.client,
    action.operation,
    finalArgs,
    ctx.trimRegistry,
    ctx.invokeOptions,
  );

  return { result };
}
