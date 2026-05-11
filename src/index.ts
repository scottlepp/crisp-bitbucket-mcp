#!/usr/bin/env node
// @scottlepp/bitbucket-mcp — token-efficient MCP server for Bitbucket Cloud.
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
import { pullRequestTool } from "./tools/pullrequest.js";
import { repositoryTool } from "./tools/repository.js";

const ALL_TOOLS: ConsolidatedToolDef[] = [pullRequestTool, repositoryTool];

// Map tool name → category for env-var filtering.
const TOOL_CATEGORY: Record<string, string> = {
  bitbucket_pullrequest: "pullrequest",
  bitbucket_repository: "repository",
};

async function main(): Promise<number> {
  let config: BitbucketConfig;
  try {
    config = getConfig();
  } catch (err) {
    process.stderr.write(`bitbucket-mcp: ${(err as Error).message}\n`);
    return 1;
  }

  if (config.toolMode === "code-api") {
    process.stderr.write(
      "bitbucket-mcp: BITBUCKET_TOOL_MODE=code-api is not yet supported (planned for Phase 4). " +
        "Falling back to classic mode.\n",
    );
  }

  const client = new BitbucketClient({ auth: config.auth });
  const sandbox = createSandbox({
    rootName: "bitbucket-mcp",
    staleMs: config.cacheTtlHours * 60 * 60 * 1000,
  });

  // Cleanup stale session dirs at startup (best-effort).
  await sandbox.cleanupStaleSessions().catch(() => {});

  // Filter tools by enabledCategories (whitelist; empty = all on).
  const enabledTools: ConsolidatedToolDef[] =
    config.toolFilter.enabledCategories.length === 0
      ? ALL_TOOLS
      : ALL_TOOLS.filter((t) => {
          const cat = TOOL_CATEGORY[t.name];
          return cat && config.toolFilter.enabledCategories.includes(cat);
        });

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
    { name: "bitbucket-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: enabledTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: buildInputSchema(t),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = enabledTools.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown tool: ${req.params.name}. Enabled: ${enabledTools.map((t) => t.name).join(", ")}`,
          },
        ],
      };
    }
    try {
      const dispatched = await dispatch(tool, req.params.arguments ?? {}, ctx);
      return {
        content: [{ type: "text", text: JSON.stringify(dispatched.result) }],
      };
    } catch (err) {
      const e = err as Error;
      return {
        isError: true,
        content: [
          { type: "text", text: `${e.name}: ${e.message}` },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return 0;
}

void main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`bitbucket-mcp: unexpected error: ${(err as Error).stack ?? err}\n`);
    process.exit(1);
  },
);
