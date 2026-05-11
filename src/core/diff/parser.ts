// Unified diff parser.
//
// Bitbucket Cloud's /diff endpoint returns standard git-style unified
// diff. We parse into ParsedDiff so the drill-in tools can serve
// per-file slices without re-parsing the raw text on every call.
//
// Scope:
//   - File headers (`diff --git a/X b/Y`)
//   - Status detection: added, deleted, renamed, copied, modified,
//     mode-change, binary
//   - Hunks (`@@ -a,b +c,d @@ optional context`)
//   - addition/deletion counts (computed from hunk lines)
//   - Preserves trailing `\ No newline at end of file` markers
//
// Out of scope (for now):
//   - Combined diffs (merge commits with multiple parents)
//   - Word-level diffs (Bitbucket's web UI feature; the API returns
//     line-level only)

import type { FileStatus, Hunk, ParsedDiff, ParsedFile } from "./types.js";

// Header regexes. Each matches one line of a diff prelude.
const RE_DIFF_GIT = /^diff --git a\/(?<old>.+?) b\/(?<new>.+?)$/;
const RE_HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

// Helper that strips an `a/`/`b/` prefix from a path in a "--- " or
// "+++ " line. Bitbucket sometimes emits `a/` even for added files
// and `b/` for deleted (with /dev/null on the other side). We treat
// `/dev/null` as a sentinel.
function parseSidePath(line: string, prefix: "--- " | "+++ "): string | null {
  if (!line.startsWith(prefix)) return null;
  const rest = line.slice(prefix.length);
  if (rest === "/dev/null") return null;
  if (rest.startsWith("a/") && prefix === "--- ") return rest.slice(2);
  if (rest.startsWith("b/") && prefix === "+++ ") return rest.slice(2);
  return rest;
}

// Parses a unified diff into a ParsedDiff. Tolerant of unknown
// header lines (we record them as `status: "unknown"` rather than
// throwing) so an unfamiliar Bitbucket edge case doesn't break the
// whole tool.
export function parseUnifiedDiff(raw: string): ParsedDiff {
  const files: ParsedFile[] = [];
  // We walk line-by-line. `lines` retains trailing CR if any; we
  // normalize by stripping a trailing \r when present so hunk body
  // lines stay clean even from CRLF inputs.
  const rawLines = raw.split("\n");

  // Normalize CRLF inputs upfront so every regex below matches
  // cleanly. Avoids stripping \r at every individual match site.
  for (let j = 0; j < rawLines.length; j++) {
    if (rawLines[j].endsWith("\r")) {
      rawLines[j] = rawLines[j].slice(0, -1);
    }
  }

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const m = line.match(RE_DIFF_GIT);
    if (!m || !m.groups) {
      i++;
      continue;
    }
    const oldPathHdr = m.groups.old;
    const newPathHdr = m.groups.new;

    // Default-modified; promote on signals below.
    let status: FileStatus = "modified";
    let isBinary = false;
    let parsedOldPath = oldPathHdr;
    let parsedNewPath = newPathHdr;
    let oldPathForRename: string | undefined;

    // Walk prelude lines until we hit the first hunk header or the
    // next `diff --git`.
    i++;
    while (i < rawLines.length) {
      const l = rawLines[i];
      if (l.startsWith("@@ ")) break;
      if (l.startsWith("diff --git ")) break;

      if (l.startsWith("new file mode ")) {
        status = "added";
      } else if (l.startsWith("deleted file mode ")) {
        status = "deleted";
      } else if (l.startsWith("rename from ")) {
        status = "renamed";
        oldPathForRename = l.slice("rename from ".length);
      } else if (l.startsWith("rename to ")) {
        // Already promoted; just capture the new path.
        parsedNewPath = l.slice("rename to ".length);
      } else if (l.startsWith("copy from ")) {
        status = "copied";
        oldPathForRename = l.slice("copy from ".length);
      } else if (l.startsWith("copy to ")) {
        parsedNewPath = l.slice("copy to ".length);
      } else if (l.startsWith("old mode ") && status === "modified") {
        // Promote tentatively; if we see hunks below, fall back to
        // modified.
        status = "mode-change";
      } else if (l.startsWith("--- ")) {
        const p = parseSidePath(l, "--- ");
        if (p) parsedOldPath = p;
      } else if (l.startsWith("+++ ")) {
        const p = parseSidePath(l, "+++ ");
        if (p) parsedNewPath = p;
      } else if (
        l.startsWith("Binary files ") ||
        l.startsWith("GIT binary patch")
      ) {
        isBinary = true;
      }
      i++;
    }

    // Walk hunks belonging to this file.
    const hunks: Hunk[] = [];
    let additions = 0;
    let deletions = 0;
    while (i < rawLines.length && rawLines[i].startsWith("@@ ")) {
      const header = rawLines[i];
      const hm = header.match(RE_HUNK);
      if (!hm) {
        // Malformed hunk header — record it raw and skip the body
        // until the next hunk or file.
        hunks.push({
          header,
          old_start: 0,
          old_count: 0,
          new_start: 0,
          new_count: 0,
          lines: [],
        });
        i++;
        while (
          i < rawLines.length &&
          !rawLines[i].startsWith("@@ ") &&
          !rawLines[i].startsWith("diff --git ")
        ) {
          i++;
        }
        continue;
      }
      const old_start = Number(hm[1]);
      const old_count = hm[2] === undefined ? 1 : Number(hm[2]);
      const new_start = Number(hm[3]);
      const new_count = hm[4] === undefined ? 1 : Number(hm[4]);
      i++;

      const body: string[] = [];
      while (
        i < rawLines.length &&
        !rawLines[i].startsWith("@@ ") &&
        !rawLines[i].startsWith("diff --git ")
      ) {
        const bodyLine = rawLines[i];
        // The trailing empty string from split("\n") at end-of-input
        // shouldn't be recorded as a hunk line.
        if (bodyLine === "" && i === rawLines.length - 1) {
          i++;
          continue;
        }
        body.push(bodyLine);
        // Count additions/deletions; skip `\ No newline at end of file`
        // markers and context lines.
        if (bodyLine.length > 0) {
          const c = bodyLine.charCodeAt(0);
          if (c === 43 /* + */) additions++;
          else if (c === 45 /* - */) deletions++;
        }
        i++;
      }
      hunks.push({
        header,
        old_start,
        old_count,
        new_start,
        new_count,
        lines: body,
      });
    }

    // Pure mode change: prelude promoted to "mode-change" but no
    // hunks followed → keep status. If there were hunks, demote back
    // to "modified" because content changed too.
    if (status === "mode-change" && hunks.length > 0) {
      status = "modified";
    }

    files.push({
      path: parsedNewPath,
      old_path: oldPathForRename ?? (status === "renamed" || status === "copied" ? parsedOldPath : undefined),
      status,
      additions,
      deletions,
      is_binary: isBinary,
      hunks,
    });
  }

  const total_additions = files.reduce((s, f) => s + f.additions, 0);
  const total_deletions = files.reduce((s, f) => s + f.deletions, 0);

  return { files, total_additions, total_deletions };
}
