// Configuration for the Bitbucket MCP server.
//
// Auth auto-detect: either App Password (BITBUCKET_USERNAME +
// BITBUCKET_APP_PASSWORD, sent as HTTP Basic) or API Token
// (BITBUCKET_API_TOKEN, sent as Bearer). API Token takes precedence
// when both are set; we surface a warning so misconfigured envs are
// loud, not silent.

import { config as loadDotenv } from "dotenv";
import { parseToolFilterEnv, parseToolMode, type ToolFilterConfig, type ToolMode } from "@scottlepp/mcp-toolkit/config";

// Priority: .env.local > .env (later calls override earlier).
// `quiet: true` keeps the CLI's stderr reserved for actual errors.
loadDotenv({ path: ".env", quiet: true });
loadDotenv({ path: ".env.local", override: true, quiet: true });

export type BitbucketAuth =
  | { kind: "app-password"; username: string; password: string }
  | { kind: "api-token"; token: string };

export interface BitbucketConfig {
  workspace: string;
  auth: BitbucketAuth;
  toolMode: ToolMode;
  toolFilter: ToolFilterConfig;
  // Optional knobs (lifted to fields so tests can override).
  bodyInlineLimit: number;
  diffDefaultMaxLines: number;
  cacheTtlHours: number;
  diffIncludeGenerated: boolean;
  disableTrim: boolean;
}

// Canonical list of consolidated tool categories. Mirrors the
// `bitbucket_<category>` MCP tool names without the prefix.
export const CONSOLIDATED_CATEGORIES = [
  "pullrequest",
  "diff",
  "repository",
  "commit",
  "pipeline",
  "branching",
  "user",
  "workspace",
] as const;

function intOr(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function boolOr(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

function resolveAuth(stderr: { write(s: string): void } = process.stderr): BitbucketAuth {
  const token = process.env.BITBUCKET_API_TOKEN?.trim();
  const username = process.env.BITBUCKET_USERNAME?.trim();
  const password = process.env.BITBUCKET_APP_PASSWORD?.trim();

  // API Token wins when both are present, but we want loud signal that
  // both were set — silent precedence is a foot-gun for users
  // migrating from app passwords.
  if (token && (username || password)) {
    stderr.write(
      "Warning: BITBUCKET_API_TOKEN is set alongside BITBUCKET_USERNAME/BITBUCKET_APP_PASSWORD. " +
        "Using API Token. Unset the App Password vars to silence this warning.\n",
    );
  }

  if (token) {
    return { kind: "api-token", token };
  }

  if (username && password) {
    return { kind: "app-password", username, password };
  }

  const missingApp: string[] = [];
  if (!username) missingApp.push("BITBUCKET_USERNAME");
  if (!password) missingApp.push("BITBUCKET_APP_PASSWORD");

  throw new Error(
    `Missing Bitbucket credentials.\n\n` +
      `Set ONE of:\n` +
      `  BITBUCKET_API_TOKEN          (recommended; Atlassian's unified API token)\n` +
      `OR\n` +
      `  BITBUCKET_USERNAME + BITBUCKET_APP_PASSWORD  (legacy; per-user app password)\n\n` +
      `Currently missing: ${missingApp.join(", ") || "(BITBUCKET_API_TOKEN)"}.`,
  );
}

export function getConfig(
  stderr: { write(s: string): void } = process.stderr,
): BitbucketConfig {
  const workspace = process.env.BITBUCKET_WORKSPACE?.trim();
  if (!workspace) {
    throw new Error(
      "Missing required env var: BITBUCKET_WORKSPACE. " +
        "Set this to the Bitbucket workspace slug your tools should default to (per-call override available).",
    );
  }

  const auth = resolveAuth(stderr);
  const toolMode = parseToolMode(process.env.BITBUCKET_TOOL_MODE, {
    envVarName: "BITBUCKET_TOOL_MODE",
  });
  const toolFilter = parseToolFilterEnv({
    enabledCategoriesEnv: process.env.BITBUCKET_ENABLED_CATEGORIES,
    disabledActionsEnv: process.env.BITBUCKET_DISABLED_ACTIONS,
    validCategories: CONSOLIDATED_CATEGORIES,
    envVarName: "BITBUCKET_ENABLED_CATEGORIES",
    stderr,
  });

  return {
    workspace,
    auth,
    toolMode,
    toolFilter,
    bodyInlineLimit: intOr(process.env.BITBUCKET_BODY_INLINE_LIMIT, 4000),
    diffDefaultMaxLines: intOr(process.env.BITBUCKET_DIFF_DEFAULT_MAX_LINES, 500),
    cacheTtlHours: intOr(process.env.BITBUCKET_CACHE_TTL_HOURS, 24),
    diffIncludeGenerated: boolOr(process.env.BITBUCKET_DIFF_INCLUDE_GENERATED, false),
    disableTrim: boolOr(process.env.BITBUCKET_DISABLE_TRIM, false),
  };
}
