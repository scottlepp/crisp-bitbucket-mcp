// bitbucket_diff — handle-based diff tool.
//
// Doesn't go through the consolidated-tool / invokeOperation framework
// because:
//   1. `get` needs to fetch text/plain (diff) + JSON (PR metadata for
//      head_sha), parse, and cache. The standard dispatcher can't.
//   2. `get_file` / `get_files` / `grep` don't hit the API at all —
//      they read from the parsed-diff cache.
//
// We define a CustomToolDef shape and wire it into the server alongside
// the consolidated tools.

import { z } from "zod";

import type { BitbucketClient } from "../auth/bitbucket-client.js";
import type { BitbucketConfig } from "../config.js";
import { createDiffCache, encodeHandle, decodeHandle, type DiffHandle, type DiffCacheInstance } from "../core/diff/cache.js";
import { applyExcludes } from "../core/diff/excludes.js";
import { getFileFromDiff, getFilesByGlob, grepDiff } from "../core/diff/drill-ins.js";
import type { FileTreeNode, ParsedDiff } from "../core/diff/types.js";

// --- Tool definition --------------------------------------------------

export interface CustomToolDef<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  // Loose input schema in JSON Schema form (rendered into tools/list).
  inputSchema: Record<string, unknown>;
  handler(input: TInput): Promise<TOutput>;
}

// --- Get response shape ----------------------------------------------

export interface GetDiffResult {
  diff_handle: string;
  head_sha: string;
  base_sha: string;
  total_files: number;
  total_additions: number;
  total_deletions: number;
  file_tree: FileTreeNode[];
  excluded_files: Array<{ path: string; reason: string }>;
}

// --- Action schemas ---------------------------------------------------

const GetSchema = z.object({
  workspace: z.string().optional(),
  repo_slug: z.string().describe("Repository slug"),
  pr_id: z.coerce.number().int().positive().describe("Pull request id"),
  include_generated: z
    .boolean()
    .optional()
    .describe(
      "When true, bypass the default lock/build/vendor file exclusions. Default false.",
    ),
  includes: z
    .array(z.string())
    .optional()
    .describe(
      "Caller-supplied include patterns (glob, e.g. ['src/**/*.ts']). When set, only matching files survive.",
    ),
  excludes: z
    .array(z.string())
    .optional()
    .describe("Additional caller-supplied exclude patterns (glob)."),
});

const GetFileSchema = z.object({
  diff_handle: z.string().describe("Handle returned by `get` (encodes pr@head_sha)."),
  path: z.string().describe("File path to fetch hunks for"),
  max_lines: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Cap total hunk lines returned. Defaults per-extension (yml/json:200, md:300, source:500, lock:50)."),
});

const GetFilesSchema = z.object({
  diff_handle: z.string(),
  glob: z.string().describe('Glob pattern, e.g. "src/**/*.ts"'),
  max_lines_per_file: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Override per-extension cap for each matched file."),
});

const GrepSchema = z.object({
  diff_handle: z.string(),
  pattern: z
    .string()
    .describe(
      "Search pattern. Supports literal substring, regex syntax (compiled if it contains metacharacters), or explicit /.../flags form.",
    ),
  context_lines: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Number of hunk lines before/after each match. Default 2."),
  max_matches: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Stop after this many matches. Default 50."),
});

// --- Tool factory -----------------------------------------------------

export interface CreateDiffToolOpts {
  config: BitbucketConfig;
  client: BitbucketClient;
  diffCache?: DiffCacheInstance;
}

export function createDiffTool(opts: CreateDiffToolOpts): CustomToolDef {
  const cache = opts.diffCache ?? createDiffCache();

  async function fetchAndCache(
    workspace: string,
    repoSlug: string,
    prId: number,
  ): Promise<{ handle: DiffHandle; parsed: ParsedDiff; baseSha: string }> {
    // Fetch PR metadata and raw diff in parallel — they're independent
    // calls and the diff is the slow one. The metadata fetch gives us
    // head_sha (for the cache key) and base_sha (returned to the agent).
    const [prMeta, rawDiff] = await Promise.all([
      opts.client.get(
        `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}`,
      ) as Promise<unknown>,
      opts.client.getText(
        `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/diff`,
      ),
    ]);

    const meta = prMeta as {
      source?: { commit?: { hash?: string } };
      destination?: { commit?: { hash?: string } };
    };
    const headSha = meta.source?.commit?.hash;
    const baseSha = meta.destination?.commit?.hash;
    if (!headSha) {
      throw new Error(
        `bitbucket_diff: PR ${prId} response missing source.commit.hash — cannot key cache.`,
      );
    }

    const handle: DiffHandle = {
      workspace,
      repo_slug: repoSlug,
      pr_id: prId,
      head_sha: headSha,
    };

    // Try cache first.
    const cached = await cache.read(handle);
    if (cached) {
      return { handle, parsed: cached, baseSha: baseSha ?? "" };
    }
    const parsed = await cache.ingest(handle, rawDiff);
    return { handle, parsed, baseSha: baseSha ?? "" };
  }

  async function handleGet(args: z.infer<typeof GetSchema>): Promise<GetDiffResult> {
    const workspace = args.workspace ?? opts.config.workspace;
    const { handle, parsed, baseSha } = await fetchAndCache(
      workspace,
      args.repo_slug,
      args.pr_id,
    );
    const { kept, excluded } = applyExcludes(parsed.files, {
      includeGenerated:
        args.include_generated ?? opts.config.diffIncludeGenerated,
      extraExcludes: args.excludes,
      includes: args.includes,
    });
    const fileTree: FileTreeNode[] = kept.map((f) => ({
      path: f.path,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      is_binary: f.is_binary,
      old_path: f.old_path,
    }));
    return {
      diff_handle: encodeHandle(handle),
      head_sha: handle.head_sha,
      base_sha: baseSha,
      total_files: fileTree.length,
      total_additions: kept.reduce((s, f) => s + f.additions, 0),
      total_deletions: kept.reduce((s, f) => s + f.deletions, 0),
      file_tree: fileTree,
      excluded_files: excluded,
    };
  }

  async function handleGetFile(args: z.infer<typeof GetFileSchema>) {
    const handle = decodeHandle(args.diff_handle);
    if (!handle) {
      throw new Error(
        `bitbucket_diff.get_file: malformed diff_handle "${args.diff_handle}"`,
      );
    }
    const parsed = await cache.read(handle);
    if (!parsed) {
      throw new Error(
        `bitbucket_diff.get_file: handle "${args.diff_handle}" not in cache. Call \`get\` first to populate.`,
      );
    }
    const result = getFileFromDiff(parsed, args.path, args.max_lines);
    if (!result) {
      throw new Error(
        `bitbucket_diff.get_file: path "${args.path}" not present in this diff. Check the file_tree on \`get\`.`,
      );
    }
    return result;
  }

  async function handleGetFiles(args: z.infer<typeof GetFilesSchema>) {
    const handle = decodeHandle(args.diff_handle);
    if (!handle) {
      throw new Error(
        `bitbucket_diff.get_files: malformed diff_handle "${args.diff_handle}"`,
      );
    }
    const parsed = await cache.read(handle);
    if (!parsed) {
      throw new Error(
        `bitbucket_diff.get_files: handle "${args.diff_handle}" not in cache. Call \`get\` first.`,
      );
    }
    return getFilesByGlob(parsed, args.glob, args.max_lines_per_file);
  }

  async function handleGrep(args: z.infer<typeof GrepSchema>) {
    const handle = decodeHandle(args.diff_handle);
    if (!handle) {
      throw new Error(
        `bitbucket_diff.grep: malformed diff_handle "${args.diff_handle}"`,
      );
    }
    const parsed = await cache.read(handle);
    if (!parsed) {
      throw new Error(
        `bitbucket_diff.grep: handle "${args.diff_handle}" not in cache. Call \`get\` first.`,
      );
    }
    return grepDiff(parsed, args.pattern, {
      contextLines: args.context_lines,
      maxMatches: args.max_matches,
    });
  }

  async function handler(input: unknown): Promise<unknown> {
    if (!input || typeof input !== "object") {
      throw new Error('bitbucket_diff: expected an object with an "action" field');
    }
    const { action, ...rest } = input as Record<string, unknown>;
    switch (action) {
      case "get": {
        const parsed = GetSchema.parse(rest);
        return handleGet(parsed);
      }
      case "get_file": {
        const parsed = GetFileSchema.parse(rest);
        return handleGetFile(parsed);
      }
      case "get_files": {
        const parsed = GetFilesSchema.parse(rest);
        return handleGetFiles(parsed);
      }
      case "grep": {
        const parsed = GrepSchema.parse(rest);
        return handleGrep(parsed);
      }
      default:
        throw new Error(
          `bitbucket_diff: unknown action "${String(action)}". Valid: get, get_file, get_files, grep.`,
        );
    }
  }

  return {
    name: "bitbucket_diff",
    description:
      "Read pull-request diffs without raw bytes entering context. " +
      "`get` returns a compact file tree + a `diff_handle` (full diff cached server-side); " +
      "`get_file(handle, path)`, `get_files(handle, glob)`, and `grep(handle, pattern, context_lines)` " +
      "drill in. Default per-extension line caps. Default exclusions for lock/build/vendor files " +
      "(opt out with include_generated: true).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["get", "get_file", "get_files", "grep"],
          description:
            "`get`: fetch the diff + return file tree + handle. " +
            "`get_file`: return hunks for one path. " +
            "`get_files`: return hunks for files matching a glob. " +
            "`grep`: regex/literal search across all hunks with context_lines.",
        },
      },
      required: ["action"],
      additionalProperties: true,
    },
    handler,
  };
}
