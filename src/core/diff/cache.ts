// Diff cache — backed by the SDK's createPageCache, keyed by
// {workspace}/{repo}/pr/{id}@{head_sha}.
//
// Bitbucket Cloud's /pullrequests/{id}/diff endpoint returns the raw
// unified diff at the current head. The handle we hand to the agent
// encodes the head SHA, so a force-push invalidates it naturally (a
// fresh `get` call hits a different cache key).
//
// We cache the *parsed* diff — not the raw text — so drill-in calls
// (get_file, grep) don't re-parse on every request.

import * as path from "node:path";

import {
  BodyCacheTooLargeError,
  createPageCache,
  type PageCacheInstance,
} from "@scottlepp/mcp-toolkit/page-cache";

import { parseUnifiedDiff } from "./parser.js";
import type { ParsedDiff } from "./types.js";

export interface DiffHandle {
  workspace: string;
  repo_slug: string;
  pr_id: number;
  head_sha: string;
}

// Encode a handle as a single string the agent can pass back. URL-safe;
// no characters that need escaping in JSON or shell flags.
export function encodeHandle(h: DiffHandle): string {
  return `${h.workspace}/${h.repo_slug}/pr/${h.pr_id}@${h.head_sha}`;
}

// Inverse of encodeHandle. Returns null on malformed input.
export function decodeHandle(s: string): DiffHandle | null {
  const m = s.match(/^([^/]+)\/([^/]+)\/pr\/(\d+)@([0-9a-f]{4,40})$/i);
  if (!m) return null;
  return {
    workspace: m[1],
    repo_slug: m[2],
    pr_id: Number(m[3]),
    head_sha: m[4],
  };
}

export interface DiffCacheOpts {
  // Forwarded to createPageCache. Defaults to "ultra-bitbucket-mcp-diffs".
  rootName?: string;
  // Override the full root path (tests pass a tmpdir).
  rootDir?: string;
  // TTL for cache entries. Defaults to 24h; diff caches are short-
  // lived because PR heads move fast.
  ttlMs?: number;
  // Per-file size cap. Defaults to 25 MB (large monorepo PRs can
  // exceed the 5 MB default of confluence-mcp).
  maxBytes?: number;
}

export interface DiffCacheInstance {
  // Cache key components → absolute file path that holds the parsed
  // diff JSON. Returns null if the entry doesn't exist (cache miss).
  // Reads back the *parsed* shape — no re-parse needed.
  read(handle: DiffHandle): Promise<ParsedDiff | null>;
  // Persist a parsed diff under the handle. Returns the absolute path.
  // Throws BodyCacheTooLargeError if the parsed shape exceeds maxBytes.
  write(handle: DiffHandle, parsed: ParsedDiff): Promise<string>;
  // Parse + write in one call. Convenience for the `get` flow.
  ingest(handle: DiffHandle, rawDiff: string): Promise<ParsedDiff>;
  // Forwards to the underlying page-cache.prune().
  prune(): Promise<void>;
  // Expose the underlying cache root for diagnostics.
  cacheRoot(): string;
}

export function createDiffCache(opts: DiffCacheOpts = {}): DiffCacheInstance {
  const pc: PageCacheInstance = createPageCache({
    rootName: opts.rootName ?? "ultra-bitbucket-mcp-diffs",
    rootDir: opts.rootDir,
    ttlMs: opts.ttlMs,
    // 25 MB default for diffs; can be overridden per-call site.
    maxBytes: opts.maxBytes ?? 25 * 1024 * 1024,
  });

  function kindFor(h: DiffHandle): string {
    // Embed workspace+repo in the kind so per-workspace pruning is
    // easy and humans can browse the cache on disk by scope.
    return `${h.workspace}__${h.repo_slug}__diffs`;
  }

  async function read(handle: DiffHandle): Promise<ParsedDiff | null> {
    // We don't have a "does this file exist" primitive on the SDK
    // cache; readBody throws if absent. Treat absence as cache miss.
    const path = handlePath(handle);
    try {
      const raw = await pc.readBody(path);
      // readBody validates the JSON shape only as `unknown`; cast
      // and trust — the writer always emits ParsedDiff.
      return raw as ParsedDiff;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      throw err;
    }
  }

  async function write(handle: DiffHandle, parsed: ParsedDiff): Promise<string> {
    return pc.writeBody(kindFor(handle), `pr-${handle.pr_id}`, handle.head_sha, parsed);
  }

  async function ingest(
    handle: DiffHandle,
    rawDiff: string,
  ): Promise<ParsedDiff> {
    const parsed = parseUnifiedDiff(rawDiff);
    try {
      await write(handle, parsed);
    } catch (err) {
      if (err instanceof BodyCacheTooLargeError) {
        // For now: surface verbatim. Phase 3 can add a fallback
        // (don't cache; serve drill-ins from the in-memory parsed
        // value for this session). Either way the caller gets a
        // usable parsed diff back.
        throw err;
      }
      throw err;
    }
    return parsed;
  }

  function handlePath(h: DiffHandle): string {
    // Mirror page-cache's internal path scheme. We could expose a
    // helper from the SDK; for now construct directly using the
    // sanitized convention (it's stable since both sides use the
    // same kind/id/version inputs).
    const sanitized = (s: string | number) =>
      String(s).replace(/[^A-Za-z0-9_-]/g, "_");
    return path.join(
      pc.cacheRoot(),
      sanitized(kindFor(h)),
      `${sanitized("pr-" + h.pr_id)}-v${sanitized(h.head_sha)}.json`,
    );
  }

  return {
    read,
    write,
    ingest,
    prune: () => pc.prune(),
    cacheRoot: () => pc.cacheRoot(),
  };
}
