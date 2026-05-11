import { describe, expect, it } from "vitest";

import {
  defaultMaxLinesForPath,
  getFileFromDiff,
  getFilesByGlob,
  grepDiff,
} from "./drill-ins.js";
import { parseUnifiedDiff } from "./parser.js";

const DIFF = `diff --git a/src/auth/client.ts b/src/auth/client.ts
--- a/src/auth/client.ts
+++ b/src/auth/client.ts
@@ -10,3 +10,4 @@ context
 keep
-old
+new
+new2
diff --git a/src/auth/client.test.ts b/src/auth/client.test.ts
new file mode 100644
--- /dev/null
+++ b/src/auth/client.test.ts
@@ -0,0 +1,2 @@
+import { Client } from './client.js';
+describe('Client', () => { error_handler });
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1,1 +1,1 @@
-"version": "0.1.0"
+"version": "0.2.0"
`;

describe("defaultMaxLinesForPath", () => {
  it("yml/json/toml → 200", () => {
    expect(defaultMaxLinesForPath("config.yml")).toBe(200);
    expect(defaultMaxLinesForPath("package.json")).toBe(200);
    expect(defaultMaxLinesForPath("Cargo.toml")).toBe(200);
  });
  it("md → 300", () => {
    expect(defaultMaxLinesForPath("README.md")).toBe(300);
  });
  it("ts/js/py → 500", () => {
    expect(defaultMaxLinesForPath("src/foo.ts")).toBe(500);
    expect(defaultMaxLinesForPath("src/foo.tsx")).toBe(500);
    expect(defaultMaxLinesForPath("script.py")).toBe(500);
  });
  it("lock → 50", () => {
    expect(defaultMaxLinesForPath("foo.lock")).toBe(50);
  });
  it("unknown → 400", () => {
    expect(defaultMaxLinesForPath("Makefile")).toBe(400);
    expect(defaultMaxLinesForPath("strange.xyz")).toBe(400);
  });
});

describe("getFileFromDiff", () => {
  const parsed = parseUnifiedDiff(DIFF);

  it("returns the hunks for the requested file", () => {
    const r = getFileFromDiff(parsed, "src/auth/client.ts");
    expect(r).not.toBeNull();
    expect(r?.additions).toBe(2);
    expect(r?.deletions).toBe(1);
    expect(r?.hunks).toHaveLength(1);
  });

  it("returns null for an unknown path", () => {
    expect(getFileFromDiff(parsed, "no/such/file.ts")).toBeNull();
  });

  it("truncation marker fires when hunks exceed max_lines", () => {
    const r = getFileFromDiff(parsed, "src/auth/client.ts", 2);
    expect(r?.truncated).toBeDefined();
    expect(r?.truncated?.total_lines).toBeGreaterThan(r?.truncated?.returned_lines ?? 0);
  });

  it("no truncation marker when within cap", () => {
    const r = getFileFromDiff(parsed, "src/auth/client.ts", 1000);
    expect(r?.truncated).toBeUndefined();
  });
});

describe("getFilesByGlob", () => {
  const parsed = parseUnifiedDiff(DIFF);

  it("matches by glob", () => {
    const r = getFilesByGlob(parsed, "src/**/*.ts");
    expect(r.matches.map((m) => m.path)).toEqual([
      "src/auth/client.ts",
      "src/auth/client.test.ts",
    ]);
    expect(r.total_matches).toBe(2);
  });

  it("empty result for no matches", () => {
    const r = getFilesByGlob(parsed, "doesnt/exist/**");
    expect(r.matches).toEqual([]);
    expect(r.total_matches).toBe(0);
  });

  it("applies per-extension caps to each file", () => {
    const r = getFilesByGlob(parsed, "**/*.json", 1);
    expect(r.matches[0]?.truncated).toBeDefined();
  });
});

describe("grepDiff", () => {
  const parsed = parseUnifiedDiff(DIFF);

  it("literal substring match across all files", () => {
    const r = grepDiff(parsed, "new2");
    expect(r.total_matches).toBe(1);
    expect(r.matches[0].path).toBe("src/auth/client.ts");
    expect(r.matches[0].matched_line).toBe("+new2");
  });

  it("regex syntax when metacharacters present", () => {
    const r = grepDiff(parsed, "new\\d");
    expect(r.total_matches).toBe(1);
    expect(r.matches[0].matched_line).toBe("+new2");
  });

  it("/.../flags form", () => {
    const r = grepDiff(parsed, "/error_handler/i");
    expect(r.total_matches).toBe(1);
    expect(r.matches[0].path).toBe("src/auth/client.test.ts");
  });

  it("context_lines surrounds the match", () => {
    const r = grepDiff(parsed, "old", { contextLines: 1 });
    expect(r.matches[0].before).toEqual([" keep"]);
    expect(r.matches[0].after).toEqual(["+new"]);
  });

  it("max_matches caps the result and sets truncated", () => {
    const r = grepDiff(parsed, "+", { maxMatches: 1 });
    expect(r.total_matches).toBe(1);
    expect(r.truncated).toBe(true);
  });
});
