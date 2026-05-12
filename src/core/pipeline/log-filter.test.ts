import { describe, expect, it } from "vitest";

import { filterLog } from "./log-filter.js";

const sampleLog = [
  "Starting build",
  "Compiling src/foo.ts",
  "Compiling src/bar.ts",
  "Warning: unused import in foo.ts",
  "Compiling src/baz.ts",
  "ERROR: cannot find symbol 'undefined_var' in bar.ts",
  "  at line 42",
  "  at line 99",
  "Compilation failed with 1 error",
  "Done in 2.3s",
].join("\n");

describe("filterLog", () => {
  it("returns the full log when no filters are set", () => {
    const r = filterLog(sampleLog);
    expect(r.total_lines).toBe(10);
    expect(r.matched_lines).toBe(10);
    expect(r.returned_lines).toBe(10);
    expect(r.applied_filters).toEqual([]);
    expect(r.lines[0]).toMatch(/^\s+1\s+Starting build/);
  });

  it("errors_only keeps lines matching the heuristics", () => {
    const r = filterLog(sampleLog, { errors_only: true });
    // ERROR:, "failed", maybe the warning depending on heuristics
    expect(r.applied_filters).toContain("errors_only");
    // ERROR: line and "failed" line should match
    const txt = r.lines.join("\n");
    expect(txt).toMatch(/ERROR: cannot find symbol/);
    expect(txt).toMatch(/Compilation failed/);
  });

  it("grep returns matches with context_lines", () => {
    const r = filterLog(sampleLog, { grep: "undefined_var", context_lines: 1 });
    expect(r.applied_filters[0]).toMatch(/grep\(undefined_var, ctx=1\)/);
    // Should include the ERROR line plus one line before and after.
    expect(r.returned_lines).toBe(3);
    expect(r.lines[1]).toMatch(/ERROR: cannot find symbol/);
  });

  it("tail returns only the last N lines after filtering", () => {
    const r = filterLog(sampleLog, { tail: 3 });
    expect(r.returned_lines).toBe(3);
    expect(r.lines.at(-1)).toMatch(/Done in 2\.3s/);
  });

  it("max_lines is the hard cap with a truncation marker", () => {
    const big = Array.from({ length: 1200 }, (_, i) => `line ${i}`).join("\n");
    const r = filterLog(big, { max_lines: 10 });
    expect(r.returned_lines).toBe(10);
    expect(r.truncated).toBeDefined();
    expect(r.truncated!.reason).toMatch(/max_lines cap of 10/);
  });

  it("combines errors_only + grep + tail", () => {
    const r = filterLog(sampleLog, {
      errors_only: true,
      grep: "symbol",
      context_lines: 0,
      tail: 5,
    });
    // Only the ERROR line matches "symbol" after errors_only filter.
    expect(r.returned_lines).toBeGreaterThanOrEqual(1);
    expect(r.lines.some((l) => /ERROR: cannot find symbol/.test(l))).toBe(true);
  });

  it("escapes regex metacharacters in literal substring patterns", () => {
    const r = filterLog("foo (bar) baz", { grep: "(bar)" });
    expect(r.returned_lines).toBe(1);
  });

  it("respects /pattern/flags syntax (flags override the default 'i')", () => {
    // With explicit `gi` both lines match case-insensitively.
    const both = filterLog("WARNING: x\nWarning: y", { grep: "/warning/gi" });
    expect(both.returned_lines).toBe(2);
    // With only `g` (no `i`), case matters and neither matches.
    const none = filterLog("WARNING: x\nWarning: y", { grep: "/warning/g" });
    expect(none.returned_lines).toBe(0);
  });

  it("preserves original line numbers in output", () => {
    const r = filterLog(sampleLog, { grep: "ERROR" });
    // ERROR line is line 6 in the original (1-indexed).
    const errLine = r.lines.find((l) => /ERROR:/.test(l));
    expect(errLine).toMatch(/^\s+6\s+ERROR:/);
  });
});
