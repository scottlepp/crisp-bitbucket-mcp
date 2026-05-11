import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { createDiffCache, decodeHandle, encodeHandle, type DiffHandle } from "./cache.js";

describe("encodeHandle / decodeHandle", () => {
  it("round-trips a well-formed handle", () => {
    const h: DiffHandle = {
      workspace: "myws",
      repo_slug: "myrepo",
      pr_id: 123,
      head_sha: "9f8e7d6abc",
    };
    const s = encodeHandle(h);
    expect(s).toBe("myws/myrepo/pr/123@9f8e7d6abc");
    expect(decodeHandle(s)).toEqual(h);
  });

  it("decodeHandle returns null on malformed input", () => {
    expect(decodeHandle("garbage")).toBeNull();
    expect(decodeHandle("ws/repo/pr/abc@deadbeef")).toBeNull(); // pr_id non-numeric
    expect(decodeHandle("ws/repo/pr/1@notHex")).toBeNull(); // sha not hex
  });

  it("accepts short SHAs (>=4 hex)", () => {
    expect(decodeHandle("ws/repo/pr/1@abcd")).not.toBeNull();
  });
});

describe("createDiffCache", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "bb-mcp-diff-cache-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  const sampleRawDiff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,1 +1,2 @@
 old
+new
`;

  it("ingest parses + writes; subsequent read returns parsed diff", async () => {
    const cache = createDiffCache({ rootDir });
    const handle: DiffHandle = {
      workspace: "ws",
      repo_slug: "repo",
      pr_id: 42,
      head_sha: "abc123",
    };
    const parsed = await cache.ingest(handle, sampleRawDiff);
    expect(parsed.files).toHaveLength(1);

    const cached = await cache.read(handle);
    expect(cached).not.toBeNull();
    expect(cached?.files[0].path).toBe("a.ts");
  });

  it("read returns null for a missing entry", async () => {
    const cache = createDiffCache({ rootDir });
    const handle: DiffHandle = {
      workspace: "ws",
      repo_slug: "repo",
      pr_id: 42,
      head_sha: "abc123",
    };
    const cached = await cache.read(handle);
    expect(cached).toBeNull();
  });

  it("different head_sha → different cache entry (force-push invalidation)", async () => {
    const cache = createDiffCache({ rootDir });
    const h1: DiffHandle = {
      workspace: "ws",
      repo_slug: "repo",
      pr_id: 42,
      head_sha: "abc123",
    };
    const h2 = { ...h1, head_sha: "def456" };
    await cache.ingest(h1, sampleRawDiff);
    const c1 = await cache.read(h1);
    const c2 = await cache.read(h2);
    expect(c1).not.toBeNull();
    expect(c2).toBeNull();
  });
});
