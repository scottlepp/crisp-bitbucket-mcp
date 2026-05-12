// Server-side filtering for pipeline step logs.
//
// Build logs are routinely multi-MB. The agent rarely needs the full
// text — it needs to know "did it pass", "what failed", "show me the
// error around X". This module applies tail / grep / errors_only /
// context_lines deterministically before the response leaves the
// server, mirroring the diff-drill-in design.
//
// All filters are composable; ordering: errors_only → grep → tail.
// (errors-first so the grep window operates on the same shape the
// user sees; tail last so it caps total returned lines.)

// --- Error heuristics -------------------------------------------------

// Patterns that flag a line as an "error" candidate. Conservative on
// purpose: false positives are cheaper than false negatives (the agent
// will see noise either way; missing the actual error wastes a turn).
const ERROR_PATTERNS: RegExp[] = [
  /\berror\b/i,
  /\bfail(ed|ure)?\b/i,
  /\bexception\b/i,
  /\bfatal\b/i,
  /\btraceback\b/i,
  /\bpanic\b/i,
  /\bsegmentation fault\b/i,
  /^\s*\^/,                  // GCC/clang carets pointing at an error
  /^\s*Error[: ]/,           // "Error: ..."
  /^\s*FAILED/,              // pytest, jest, etc.
  /^\s*✘/,                   // common CLI failure glyph
  /\bcommand exited with (?:code |status )?[1-9]/i,
];

function isErrorLine(line: string): boolean {
  for (const re of ERROR_PATTERNS) {
    if (re.test(line)) return true;
  }
  return false;
}

// --- Grep -------------------------------------------------------------

// Parse a pattern that's either a literal substring, a bare regex, or
// `/pattern/flags`. Same syntax as bitbucket_diff grep.
function compilePattern(pattern: string): RegExp {
  const slashForm = /^\/(.+)\/([gimsuy]*)$/;
  const m = pattern.match(slashForm);
  if (m) {
    return new RegExp(m[1], m[2] || "i");
  }
  // Treat anything containing regex metacharacters as a regex, else
  // literal substring (escape for safety).
  const hasMetacharacter = /[.*+?^$|()[\]{}\\]/.test(pattern);
  if (hasMetacharacter) {
    try {
      return new RegExp(pattern, "i");
    } catch {
      // Bad regex → fall back to literal escape.
      return new RegExp(escapeRegex(pattern), "i");
    }
  }
  return new RegExp(escapeRegex(pattern), "i");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^$|()[\]{}\\]/g, "\\$&");
}

// --- Filter pipeline --------------------------------------------------

export interface LogFilterOpts {
  // Return only lines that look like errors per heuristics above.
  errors_only?: boolean;
  // Substring or regex; when set, only matching lines (plus
  // context_lines around each match) are returned.
  grep?: string;
  // Number of context lines before/after each grep match. Default 2.
  context_lines?: number;
  // Return only the last N lines of the filtered result. Default
  // undefined (unbounded). Common usage: `tail: 100`.
  tail?: number;
  // Hard ceiling on returned lines regardless of other filters. Saves
  // a huge unfiltered log from blowing context if the agent forgets
  // tail/grep. Default 500.
  max_lines?: number;
}

export interface LogFilterResult {
  // The filtered/decorated lines, one entry per included line. Already
  // prefixed with line numbers from the *original* log (1-indexed) so
  // the agent can reference them in follow-up calls or comments.
  lines: string[];
  // Total lines in the original (pre-filter) log.
  total_lines: number;
  // Lines that survived filtering before max_lines / tail capped them.
  matched_lines: number;
  // Lines actually returned (lines.length).
  returned_lines: number;
  // Filters applied, in order (for debugging).
  applied_filters: string[];
  // Set when the result was capped by max_lines or tail.
  truncated?: {
    reason: string;
    suggestion: string;
  };
}

export function filterLog(raw: string, opts: LogFilterOpts = {}): LogFilterResult {
  const allLines = raw.split("\n");
  const total = allLines.length;
  const applied: string[] = [];

  // Step 1: errors_only — index-based so we can keep context if grep
  // runs after. For now we just filter to error lines (no extra
  // context); if you need context around errors, combine with grep
  // pattern matching common error markers.
  let kept: Array<{ idx: number; line: string }> = allLines.map((line, idx) => ({ idx, line }));
  if (opts.errors_only) {
    kept = kept.filter((e) => isErrorLine(e.line));
    applied.push("errors_only");
  }

  // Step 2: grep with context.
  if (opts.grep !== undefined && opts.grep.length > 0) {
    const re = compilePattern(opts.grep);
    const ctx = Math.max(0, opts.context_lines ?? 2);
    const wanted = new Set<number>();
    // Search across the original (or errors-filtered) line set.
    const pool = kept;
    const matchPositions: number[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (re.test(pool[i].line)) {
        matchPositions.push(i);
      }
    }
    for (const p of matchPositions) {
      for (let j = Math.max(0, p - ctx); j <= Math.min(pool.length - 1, p + ctx); j++) {
        wanted.add(j);
      }
    }
    kept = kept.filter((_, i) => wanted.has(i));
    applied.push(`grep(${opts.grep}, ctx=${ctx})`);
  }

  const matched = kept.length;

  // Step 3: max_lines hard cap.
  const max = opts.max_lines ?? 500;
  let truncated: LogFilterResult["truncated"] = undefined;
  if (opts.tail !== undefined && opts.tail > 0) {
    if (kept.length > opts.tail) {
      kept = kept.slice(-opts.tail);
      applied.push(`tail(${opts.tail})`);
    } else {
      applied.push(`tail(${opts.tail})`);
    }
  }
  if (kept.length > max) {
    kept = kept.slice(-max);
    truncated = {
      reason: `max_lines cap of ${max} reached`,
      suggestion:
        "Pass `grep` to target what you need, `errors_only: true` for failure inspection, or a higher `max_lines`.",
    };
    applied.push(`max_lines(${max})`);
  }

  return {
    lines: kept.map((e) => `${(e.idx + 1).toString().padStart(6, " ")}  ${e.line}`),
    total_lines: total,
    matched_lines: matched,
    returned_lines: kept.length,
    applied_filters: applied,
    truncated,
  };
}
