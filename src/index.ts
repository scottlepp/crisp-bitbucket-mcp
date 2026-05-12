#!/usr/bin/env node
// @scottlepp/crisp-bitbucket-mcp — token-efficient MCP server for Bitbucket Cloud.
//
// Two runtime modes (BITBUCKET_TOOL_MODE):
//   - classic   (default): expose ~8 consolidated MCP tools backed
//     by the SDK's invokeOperation dispatcher.
//   - code-api: expose a single `bitbucket_code_api` tool that hands
//     the agent a path to the bundled `bitbucket-cli` binary + IPC
//     socket address. Used for shell-capable hosts (Claude Code).
//
// Phase 1 wires the classic path with pullrequest + repository tools.
// Phase 2 adds bitbucket_diff. Phase 3 adds remaining tools.
// Phase 4 wires up code-api mode + CLI.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { createSandbox } from "@scottlepp/mcp-toolkit/sandbox";

import { BitbucketClient } from "./auth/bitbucket-client.js";
import { getConfig, type BitbucketConfig } from "./config.js";
import { operations } from "./core/operations.js";
import { trimRegistry } from "./core/trim-registry.js";
import {
  buildInputSchema,
  dispatch,
  type ConsolidatedToolDef,
  type DispatcherContext,
} from "./tools/dispatcher.js";
import { branchingTool } from "./tools/branching.js";
import { commitTool } from "./tools/commit.js";
import { createDiffTool, type CustomToolDef } from "./tools/diff.js";
import { pipelineTool } from "./tools/pipeline.js";
import { pullRequestTool } from "./tools/pullrequest.js";
import { repositoryTool } from "./tools/repository.js";
import { userTool } from "./tools/user.js";
import { workspaceTool } from "./tools/workspace.js";

const ALL_CONSOLIDATED_TOOLS: ConsolidatedToolDef[] = [
  pullRequestTool,
  repositoryTool,
  commitTool,
  userTool,
  workspaceTool,
  pipelineTool,
  branchingTool,
];

// Map tool name → category for env-var filtering.
const TOOL_CATEGORY: Record<string, string> = {
  bitbucket_pullrequest: "pullrequest",
  bitbucket_repository: "repository",
  bitbucket_diff: "diff",
  bitbucket_commit: "commit",
  bitbucket_user: "user",
  bitbucket_workspace: "workspace",
  bitbucket_pipeline: "pipeline",
  bitbucket_branching: "branching",
};

async function main(): Promise<void> {
  let config: BitbucketConfig;
  try {
    config = getConfig();
  } catch (err) {
    process.stderr.write(`crisp-bitbucket-mcp: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (config.toolMode === "code-api") {
    process.stderr.write(
      "crisp-bitbucket-mcp: BITBUCKET_TOOL_MODE=code-api is not yet supported (planned for Phase 4). " +
        "Falling back to classic mode.\n",
    );
  }

  const client = new BitbucketClient({ auth: config.auth, apiBase: config.apiBase });
  const sandbox = createSandbox({
    rootName: "crisp-bitbucket-mcp",
    staleMs: config.cacheTtlHours * 60 * 60 * 1000,
  });

  // Cleanup stale session dirs at startup (best-effort).
  await sandbox.cleanupStaleSessions().catch(() => {});

  // Build the bitbucket_diff custom tool (separate dispatch path —
  // doesn't fit the consolidated-tool shape because get_* and grep
  // read from the diff cache, not the operations manifest).
  const diffTool = createDiffTool({ config, client });

  // Filter tools by enabledCategories (whitelist; empty = all on).
  const categoryEnabled = (toolName: string): boolean => {
    if (config.toolFilter.enabledCategories.length === 0) return true;
    const cat = TOOL_CATEGORY[toolName];
    return Boolean(cat && config.toolFilter.enabledCategories.includes(cat));
  };

  const enabledConsolidatedTools = ALL_CONSOLIDATED_TOOLS.filter((t) =>
    categoryEnabled(t.name),
  );
  const enabledCustomTools: CustomToolDef[] = categoryEnabled(diffTool.name)
    ? [diffTool]
    : [];

  // Default-workspace injection: tools accept an optional `workspace`
  // override but most callers will rely on BITBUCKET_WORKSPACE. The
  // dispatcher's `preprocess` hook runs after Zod validation, so we
  // can safely fill in the default here.
  const ctx: DispatcherContext = {
    manifest: operations,
    client,
    trimRegistry,
    invokeOptions: {
      disabledActions: config.toolFilter.disabledActions,
    },
    preprocess: (_op, args) => {
      if (args.workspace === undefined || args.workspace === "") {
        return { ...args, workspace: config.workspace };
      }
      return args;
    },
  };

  // --- MCP server wiring -------------------------------------------

  const server = new Server(
    { name: "crisp-bitbucket-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...enabledConsolidatedTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: buildInputSchema(t),
      })),
      ...enabledCustomTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = req.params.arguments ?? {};

    const consolidated = enabledConsolidatedTools.find(
      (t) => t.name === req.params.name,
    );
    if (consolidated) {
      try {
        const dispatched = await dispatch(consolidated, args, ctx);
        return {
          content: [{ type: "text", text: JSON.stringify(dispatched.result) }],
        };
      } catch (err) {
        const e = err as Error;
        return {
          isError: true,
          content: [{ type: "text", text: `${e.name}: ${e.message}` }],
        };
      }
    }

    const custom = enabledCustomTools.find((t) => t.name === req.params.name);
    if (custom) {
      try {
        const result = await custom.handler(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err) {
        const e = err as Error;
        return {
          isError: true,
          content: [{ type: "text", text: `${e.name}: ${e.message}` }],
        };
      }
    }

    const enabledNames = [
      ...enabledConsolidatedTools.map((t) => t.name),
      ...enabledCustomTools.map((t) => t.name),
    ];
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Unknown tool: ${req.params.name}. Enabled: ${enabledNames.join(", ")}`,
        },
      ],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `crisp-bitbucket-mcp: stdio server ready (mode=${config.toolMode}, tools=${enabledConsolidatedTools.length + enabledCustomTools.length})\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`crisp-bitbucket-mcp: unexpected error: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
