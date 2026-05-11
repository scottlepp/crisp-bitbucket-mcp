// Drill-in helpers that operate on a parsed diff.
//
// Used by the bitbucket_diff tool's get_file / get_files / grep
// actions. All filtering happens server-side; the agent receives
// already-shaped output.

import { minimatch } from "minimatch";

import type { Hunk, ParsedDiff, ParsedFile } from "./types.js";

// --- Per-extension default line caps (lifted from pdogra1299).
//
// Applies when the caller doesn't pass `max_lines`. Goal: yaml/json/
// toml configs are usually small enough that 200 lines is plenty;
// markdown can be longer; source code can be much longer; lock files
// just need a token nod.
const DEFAULT_LINES_BY_EXT: Record<string, number> = {
  ".yml": 200,
  ".yaml": 200,
  ".json": 200,
  ".toml": 200,
  ".md": 300,
  ".rst": 300,
  ".ts": 500,
  ".tsx": 500,
  ".js": 500,
  ".jsx": 500,
  ".py": 500,
  ".go": 500,
  ".rs": 500,
  ".java": 500,
  ".kt": 500,
  ".rb": 500,
  ".c": 500,
  ".cc": 500,
  ".cpp": 500,
  ".h": 500,
  ".hpp": 500,
  ".cs": 500,
  ".php": 500,
  ".sh": 400,
  ".sql": 400,
  ".lock": 50,
};
const DEFAULT_LINES_UNKNOWN = 400;

export function defaultMaxLinesForPath(path: string): number {
  const dotIdx = path.lastIndexOf(".");
  if (dotIdx < 0) return DEFAULT_LINES_UNKNOWN;
  const ext = path.slice(dotIdx).toLowerCase();
  return DEFAULT_LINES_BY_EXT[ext] ?? DEFAULT_LINES_UNKNOWN;
}

// --- Per-file shape returned by get_file / get_files.

export interface DrillInFile {
  path: string;
  status: ParsedFile["status"];
  old_path?: string;
  additions: number;
  deletions: number;
  is_binary: boolean;
  hunks: Array<{
    header: string;
    old_start: number;
    old_count: number;
    new_start: number;
    new_count: number;
    lines: string[];
  }>;
  // Set when the file was truncated by max_lines. Tells the agent
  // there are more hunks behind the curtain and how to drill in
  // further (typically `grep` for a specific symbol).
  truncated?: {
    reason: string;
    total_lines: number;
    returned_lines: number;
    suggestion: string;
  };
}

// Slice hunks until we hit max_lines. Prefers atomic-hunk boundaries
// when possible; will slice the last partial hunk when needed so the
// caller always receives ≤ max_lines of content. The returned shape
// is NOT a parseable diff fragment after a partial-hunk slice — the
// agent gets line-level context, not a re-appliable patch.
function capHunks(file: ParsedFile, maxLines: number): {
  hunks: Hunk[];
  totalLines: number;
  returnedLines: number;
} {
  let total = 0;
  for (const h of file.hunks) total += h.lines.length;
  if (total <= maxLines) {
    return { hunks: file.hunks, totalLines: total, returnedLines: total };
  }
  const kept: Hunk[] = [];
  let count = 0;
  for (const h of file.hunks) {
    if (count + h.lines.length <= maxLines) {
      kept.push(h);
      count += h.lines.length;
      continue;
    }
    // Partial slice for the final hunk we can fit.
    const remaining = maxLines - count;
    if (remaining > 0) {
      kept.push({ ...h, lines: h.lines.slice(0, remaining) });
      count += remaining;
    }
    break;
  }
  return { hunks: kept, totalLines: total, returnedLines: count };
}

// Find one file in the parsed diff and shape it for the agent.
// Returns null when the file isn't in the diff (the file tree should
// have already told the caller what's available; we don't error so
// the agent can use the same flow for "is X in this PR?" queries).
export function getFileFromDiff(
  parsed: ParsedDiff,
  path: string,
  maxLines?: number,
): DrillInFile | null {
  const file = parsed.files.find(
    (f) => f.path === path || f.old_path === path,
  );
  if (!file) return null;
  const cap = maxLines ?? defaultMaxLinesForPath(file.path);
  const { hunks, totalLines, returnedLines } = capHunks(file, cap);
  const out: DrillInFile = {
    path: file.path,
    status: file.status,
    old_path: file.old_path,
    additions: file.additions,
    deletions: file.deletions,
    is_binary: file.is_binary,
    hunks: hunks.map((h) => ({
      header: h.header,
      old_start: h.old_start,
      old_count: h.old_count,
      new_start: h.new_start,
      new_count: h.new_count,
      lines: h.lines,
    })),
  };
  if (returnedLines < totalLines) {
    out.truncated = {
      reason: `max_lines cap of ${cap} reached`,
      total_lines: totalLines,
      returned_lines: returnedLines,
      suggestion: `Call grep(pattern, context_lines) to find specific changes, or pass a higher max_lines.`,
    };
  }
  return out;
}

// Match a list of files by glob (path-aware, supports `**`). Iterates
// the parsed diff's files preserving order so the agent gets a stable
// sequence.
export function getFilesByGlob(
  parsed: ParsedDiff,
  glob: string,
  maxLinesPerFile?: number,
): { matches: DrillInFile[]; total_matches: number } {
  const matched = parsed.files.filter((f) =>
    minimatch(f.path, glob, { dot: true, matchBase: false }),
  );
  const out: DrillInFile[] = [];
  for (const f of matched) {
    const drilled = getFileFromDiff(parsed, f.path, maxLinesPerFile);
    if (drilled) out.push(drilled);
  }
  return { matches: out, total_matches: matched.length };
}

// --- Grep across the parsed diff.

export interface GrepMatch {
  path: string;
  // The matched hunk header (so the caller knows the location).
  hunk_header: string;
  // 1-indexed line number within the hunk body.
  hunk_line_index: number;
  // The literal hunk line that matched (including leading +/-/space).
  matched_line: string;
  // Context window around the match — `context_lines` lines before
  // and after. Each entry is a raw hunk line.
  before: string[];
  after: string[];
}

export interface GrepResult {
  pattern: string;
  total_matches: number;
  truncated: boolean;
  matches: GrepMatch[];
}

// Server-side grep across all hunks. Returns matching lines with
// context. Both literal substring and JS regex are supported — if the
// pattern looks like a regex (`/foo/i` or any string that compiles
// cleanly as a RegExp), we treat it as such; otherwise plain
// substring.
export function grepDiff(
  parsed: ParsedDiff,
  pattern: string,
  options: { contextLines?: number; maxMatches?: number } = {},
): GrepResult {
  const contextLines = options.contextLines ?? 2;
  const maxMatches = options.maxMatches ?? 50;
  const matcher = compileMatcher(pattern);
  const matches: GrepMatch[] = [];
  let truncated = false;

  for (const file of parsed.files) {
    for (const h of file.hunks) {
      for (let li = 0; li < h.lines.length; li++) {
        if (matches.length >= maxMatches) {
          truncated = true;
          break;
        }
        const line = h.lines[li];
        if (!matcher(line)) continue;
        matches.push({
          path: file.path,
          hunk_header: h.header,
          hunk_line_index: li,
          matched_line: line,
          before: h.lines.slice(Math.max(0, li - contextLines), li),
          after: h.lines.slice(li + 1, li + 1 + contextLines),
        });
      }
      if (truncated) break;
    }
    if (truncated) break;
  }

  return {
    pattern,
    total_matches: matches.length,
    truncated,
    matches,
  };
}

// Decide whether `pattern` should be interpreted as a regex or
// literal. Tries to compile as a RegExp; on failure, falls back to
// substring matching. `/.../flags` syntax is also recognized.
function compileMatcher(pattern: string): (line: string) => boolean {
  // Explicit `/.../flags` form.
  const slashForm = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
  if (slashForm) {
    try {
      const re = new RegExp(slashForm[1], slashForm[2]);
      return (line) => re.test(line);
    } catch {
      // Fall through to literal.
    }
  }
  // Anything containing regex metacharacters: try compile.
  if (/[\\^$.*+?()[\]{}|]/.test(pattern)) {
    try {
      const re = new RegExp(pattern);
      return (line) => re.test(line);
    } catch {
      // Fall through to literal.
    }
  }
  // Literal substring match.
  return (line) => line.includes(pattern);
}
