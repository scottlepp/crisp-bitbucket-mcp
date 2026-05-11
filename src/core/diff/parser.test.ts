import { describe, expect, it } from "vitest";

import { parseUnifiedDiff } from "./parser.js";

const SIMPLE_MOD = `diff --git a/src/foo.ts b/src/foo.ts
index abc..def 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 unchanged
-removed
+added
+added2
 unchanged
`;

describe("parseUnifiedDiff (basic modification)", () => {
  it("parses path, status, and additions/deletions", () => {
    const p = parseUnifiedDiff(SIMPLE_MOD);
    expect(p.files).toHaveLength(1);
    expect(p.files[0].path).toBe("src/foo.ts");
    expect(p.files[0].status).toBe("modified");
    expect(p.files[0].additions).toBe(2);
    expect(p.files[0].deletions).toBe(1);
    expect(p.files[0].is_binary).toBe(false);
    expect(p.total_additions).toBe(2);
    expect(p.total_deletions).toBe(1);
  });

  it("preserves hunk header + body", () => {
    const p = parseUnifiedDiff(SIMPLE_MOD);
    const h = p.files[0].hunks[0];
    expect(h.header.startsWith("@@ -1,3 +1,4 @@")).toBe(true);
    expect(h.old_start).toBe(1);
    expect(h.old_count).toBe(3);
    expect(h.new_start).toBe(1);
    expect(h.new_count).toBe(4);
    expect(h.lines).toEqual([
      " unchanged",
      "-removed",
      "+added",
      "+added2",
      " unchanged",
    ]);
  });
});

describe("parseUnifiedDiff (added file)", () => {
  const ADD = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 000..abc
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+line1
+line2
+line3
`;
  it("detects added status via `new file mode`", () => {
    const p = parseUnifiedDiff(ADD);
    expect(p.files[0].status).toBe("added");
    expect(p.files[0].path).toBe("src/new.ts");
    expect(p.files[0].additions).toBe(3);
    expect(p.files[0].deletions).toBe(0);
  });
});

describe("parseUnifiedDiff (deleted file)", () => {
  const DEL = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc..000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-bye
-bye2
`;
  it("detects deleted status via `deleted file mode`", () => {
    const p = parseUnifiedDiff(DEL);
    expect(p.files[0].status).toBe("deleted");
    expect(p.files[0].path).toBe("src/old.ts");
    expect(p.files[0].additions).toBe(0);
    expect(p.files[0].deletions).toBe(2);
  });
});

describe("parseUnifiedDiff (rename + content change)", () => {
  const RENAME = `diff --git a/src/a.ts b/src/b.ts
similarity index 90%
rename from src/a.ts
rename to src/b.ts
index abc..def 100644
--- a/src/a.ts
+++ b/src/b.ts
@@ -1,2 +1,3 @@
 keep
-old
+new
+new2
`;
  it("detects renamed status + captures old_path", () => {
    const p = parseUnifiedDiff(RENAME);
    expect(p.files[0].status).toBe("renamed");
    expect(p.files[0].path).toBe("src/b.ts");
    expect(p.files[0].old_path).toBe("src/a.ts");
    expect(p.files[0].additions).toBe(2);
    expect(p.files[0].deletions).toBe(1);
  });
});

describe("parseUnifiedDiff (pure rename, no content delta)", () => {
  const PURE_RENAME = `diff --git a/old.ts b/new.ts
similarity index 100%
rename from old.ts
rename to new.ts
`;
  it("has zero hunks, additions, deletions", () => {
    const p = parseUnifiedDiff(PURE_RENAME);
    expect(p.files[0].status).toBe("renamed");
    expect(p.files[0].path).toBe("new.ts");
    expect(p.files[0].old_path).toBe("old.ts");
    expect(p.files[0].hunks).toEqual([]);
    expect(p.files[0].additions).toBe(0);
    expect(p.files[0].deletions).toBe(0);
  });
});

describe("parseUnifiedDiff (binary)", () => {
  const BIN = `diff --git a/image.png b/image.png
index abc..def 100644
Binary files a/image.png and b/image.png differ
`;
  it("marks is_binary, no hunks, zero adds/dels", () => {
    const p = parseUnifiedDiff(BIN);
    expect(p.files[0].is_binary).toBe(true);
    expect(p.files[0].hunks).toEqual([]);
  });
});

describe("parseUnifiedDiff (mode change only)", () => {
  const MODE = `diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
`;
  it("detects mode-change status", () => {
    const p = parseUnifiedDiff(MODE);
    expect(p.files[0].status).toBe("mode-change");
    expect(p.files[0].hunks).toEqual([]);
  });
});

describe("parseUnifiedDiff (multi-file)", () => {
  const MULTI = `${SIMPLE_MOD}diff --git a/src/bar.ts b/src/bar.ts
new file mode 100644
--- /dev/null
+++ b/src/bar.ts
@@ -0,0 +1,1 @@
+single
`;
  it("parses multiple files and aggregates totals", () => {
    const p = parseUnifiedDiff(MULTI);
    expect(p.files).toHaveLength(2);
    expect(p.files[0].path).toBe("src/foo.ts");
    expect(p.files[1].path).toBe("src/bar.ts");
    expect(p.total_additions).toBe(3);
    expect(p.total_deletions).toBe(1);
  });
});

describe("parseUnifiedDiff (CRLF input)", () => {
  it("strips CR from hunk body lines", () => {
    const CRLF = SIMPLE_MOD.replace(/\n/g, "\r\n");
    const p = parseUnifiedDiff(CRLF);
    expect(p.files[0].hunks[0].lines).toEqual([
      " unchanged",
      "-removed",
      "+added",
      "+added2",
      " unchanged",
    ]);
  });
});

describe("parseUnifiedDiff (preserves no-newline marker)", () => {
  const NO_NEWLINE = `diff --git a/x.ts b/x.ts
--- a/x.ts
+++ b/x.ts
@@ -1,1 +1,1 @@
-old
\\ No newline at end of file
+new
\\ No newline at end of file
`;
  it("keeps the marker verbatim in hunk lines", () => {
    const p = parseUnifiedDiff(NO_NEWLINE);
    const lines = p.files[0].hunks[0].lines;
    expect(lines).toContain("\\ No newline at end of file");
    // The marker is not an addition/deletion.
    expect(p.files[0].additions).toBe(1);
    expect(p.files[0].deletions).toBe(1);
  });
});

describe("parseUnifiedDiff (multiple hunks)", () => {
  const MULTI_HUNK = `diff --git a/x.ts b/x.ts
--- a/x.ts
+++ b/x.ts
@@ -1,2 +1,2 @@
 keep1
-old1
+new1
@@ -10,2 +10,3 @@ context
 keep10
+added10
 keep11
`;
  it("captures both hunks with correct ranges", () => {
    const p = parseUnifiedDiff(MULTI_HUNK);
    expect(p.files[0].hunks).toHaveLength(2);
    expect(p.files[0].hunks[0].old_start).toBe(1);
    expect(p.files[0].hunks[1].old_start).toBe(10);
    expect(p.files[0].additions).toBe(2);
    expect(p.files[0].deletions).toBe(1);
  });
});

describe("parseUnifiedDiff (empty / no diff)", () => {
  it("returns empty files for empty input", () => {
    const p = parseUnifiedDiff("");
    expect(p.files).toEqual([]);
    expect(p.total_additions).toBe(0);
  });

  it("ignores stray header lines without diff --git", () => {
    const p = parseUnifiedDiff("some preamble\nmore text\n");
    expect(p.files).toEqual([]);
  });
});
