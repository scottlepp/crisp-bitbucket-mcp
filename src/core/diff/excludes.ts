// Default exclude patterns for diff filtering.
//
// Goal: drop files that almost never carry meaningful review signal
// (lock files, generated code, vendored deps, build output) so the
// file tree returned by `bitbucket_diff get` stays scannable.
//
// We surface the dropped files via `excluded_files: [{path, reason}]`
// on the response so the agent can see what was filtered and override
// via `include_generated: true` if needed.
//
// Patterns use minimatch (`**`, `*`, glob). Adapted from
// pdogra1299/bitbucket-mcp-server and standard CI lint rules.

import { minimatch } from "minimatch";

import type { ExcludedFile, ParsedFile } from "./types.js";

export interface ExcludeRule {
  pattern: string;
  reason: string;
}

// Ordered by specificity — first match wins for the `reason` reported.
export const DEFAULT_EXCLUDE_RULES: ReadonlyArray<ExcludeRule> = [
  // Lock files (deterministic regen; review the package.json change instead).
  { pattern: "**/package-lock.json", reason: "lock file" },
  { pattern: "**/yarn.lock", reason: "lock file" },
  { pattern: "**/pnpm-lock.yaml", reason: "lock file" },
  { pattern: "**/composer.lock", reason: "lock file" },
  { pattern: "**/Pipfile.lock", reason: "lock file" },
  { pattern: "**/poetry.lock", reason: "lock file" },
  { pattern: "**/Gemfile.lock", reason: "lock file" },
  { pattern: "**/Cargo.lock", reason: "lock file" },
  { pattern: "**/go.sum", reason: "lock file" },
  { pattern: "**/*.lock", reason: "lock file" },

  // Generated code by convention.
  { pattern: "**/*.pb.go", reason: "generated (protobuf)" },
  { pattern: "**/*_pb2.py", reason: "generated (protobuf)" },
  { pattern: "**/*_pb2_grpc.py", reason: "generated (protobuf grpc)" },
  { pattern: "**/*.pb.cc", reason: "generated (protobuf)" },
  { pattern: "**/*.pb.h", reason: "generated (protobuf)" },
  { pattern: "**/*.gen.ts", reason: "generated (.gen.ts)" },
  { pattern: "**/*.gen.go", reason: "generated (.gen.go)" },
  { pattern: "**/*.generated.*", reason: "generated (.generated.*)" },
  { pattern: "**/*.snap", reason: "test snapshot" },

  // Build output / vendored deps.
  { pattern: "**/dist/**", reason: "build output (dist/)" },
  { pattern: "**/build/**", reason: "build output (build/)" },
  { pattern: "**/out/**", reason: "build output (out/)" },
  { pattern: "**/.next/**", reason: "build output (.next/)" },
  { pattern: "**/target/**", reason: "build output (target/)" },
  { pattern: "**/vendor/**", reason: "vendored dependency" },
  { pattern: "**/node_modules/**", reason: "vendored dependency" },
  { pattern: "**/__pycache__/**", reason: "build artifact (__pycache__)" },

  // Minified bundles — usually shipped artifacts, no review value.
  { pattern: "**/*.min.js", reason: "minified bundle" },
  { pattern: "**/*.min.css", reason: "minified bundle" },
] as const;

export interface ApplyExcludesOpts {
  // When true, return the full file list unfiltered. Surfaces the
  // user's `include_generated: true` opt-in.
  includeGenerated?: boolean;
  // Additional caller-supplied exclude patterns. Layered ON TOP of
  // defaults — the caller can't (yet) remove a specific default rule;
  // they can only add or bypass via includeGenerated.
  extraExcludes?: readonly string[];
  // Caller-supplied include patterns. When set, ONLY files matching
  // any include pattern survive. Applied before excludes. Use to
  // narrow to a specific subdirectory (e.g. `["src/**"]`).
  includes?: readonly string[];
}

export interface ApplyExcludesResult {
  kept: ParsedFile[];
  excluded: ExcludedFile[];
}

// Partition a parsed diff's file list into kept/excluded per the rules.
// Always-on default exclusions can be bypassed by passing
// `includeGenerated: true`. Caller-supplied includes filter further
// (allowlist) and extraExcludes filter further (denylist).
export function applyExcludes(
  files: readonly ParsedFile[],
  opts: ApplyExcludesOpts = {},
): ApplyExcludesResult {
  const kept: ParsedFile[] = [];
  const excluded: ExcludedFile[] = [];
  const useDefaults = !opts.includeGenerated;

  for (const f of files) {
    // Includes pass first (allowlist). When set, anything not
    // matching is excluded with `not included` as the reason.
    if (opts.includes && opts.includes.length > 0) {
      const matchedInclude = opts.includes.some((p) =>
        minimatch(f.path, p, { dot: true, matchBase: false }),
      );
      if (!matchedInclude) {
        excluded.push({ path: f.path, reason: "not in includes filter" });
        continue;
      }
    }

    // Defaults.
    let droppedReason: string | null = null;
    if (useDefaults) {
      for (const rule of DEFAULT_EXCLUDE_RULES) {
        if (minimatch(f.path, rule.pattern, { dot: true, matchBase: false })) {
          droppedReason = rule.reason;
          break;
        }
      }
    }

    // Extra (per-call) excludes.
    if (!droppedReason && opts.extraExcludes && opts.extraExcludes.length > 0) {
      for (const p of opts.extraExcludes) {
        if (minimatch(f.path, p, { dot: true, matchBase: false })) {
          droppedReason = `excluded by caller pattern: ${p}`;
          break;
        }
      }
    }

    if (droppedReason) {
      excluded.push({ path: f.path, reason: droppedReason });
    } else {
      kept.push(f);
    }
  }

  return { kept, excluded };
}
