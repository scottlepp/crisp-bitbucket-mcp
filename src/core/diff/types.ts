// Parsed-diff data model.
//
// Stays internal to the diff module — the agent never sees these
// shapes directly. The drill-in tools (`get_file`, `get_files`,
// `grep`) read from a parsed diff and project to compact response
// shapes; the file tree exposed by `get` is a slim projection of
// ParsedFile metadata.

export type FileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "mode-change"
  // Unknown headers shouldn't crash the parser; we surface them so
  // downstream can decide whether to ignore.
  | "unknown";

export interface Hunk {
  // The `@@ -10,7 +10,8 @@ context` header line verbatim.
  header: string;
  old_start: number;
  old_count: number;
  new_start: number;
  new_count: number;
  // Body lines, each carrying its leading +/-/space character.
  // Excludes the `@@` header itself. A `\ No newline at end of file`
  // marker is preserved verbatim.
  lines: string[];
}

export interface ParsedFile {
  // Effective path. For renames/copies this is the new path.
  path: string;
  // Only populated for renames/copies (status === "renamed" | "copied").
  old_path?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  is_binary: boolean;
  // Empty for binary files, pure mode changes, and renames with no
  // content delta.
  hunks: Hunk[];
}

export interface ParsedDiff {
  files: ParsedFile[];
  total_additions: number;
  total_deletions: number;
}

// What surfaces in the agent-facing `get` response (the file tree).
export interface FileTreeNode {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  is_binary: boolean;
  old_path?: string;
}

export interface ExcludedFile {
  path: string;
  reason: string;
}
