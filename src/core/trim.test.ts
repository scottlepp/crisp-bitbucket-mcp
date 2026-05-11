import { describe, expect, it } from "vitest";

import type {
  BitbucketCommit,
  BitbucketComment,
  BitbucketPullRequest,
  BitbucketRepository,
} from "../types/bitbucket.js";
import {
  commentListSummary,
  commentRow,
  commentSummary,
  commitListSummary,
  commitRow,
  commitSummary,
  pullRequestListSummary,
  pullRequestRow,
  pullRequestSummary,
  repositoryListSummary,
  repositoryRow,
  repositorySummary,
} from "./trim.js";

// Stand-in PR with the verbose fields we strip.
const samplePr: BitbucketPullRequest = {
  id: 39636,
  title: "MON-743: prometheus endpoints",
  description: "raw markdown body",
  state: "OPEN",
  author: {
    uuid: "{abc}",
    display_name: "Roman Trusov",
    type: "user",
    account_id: "noisy-account-id",
    nickname: "rtrusov",
  },
  source: { branch: { name: "feature/prom" }, commit: { hash: "abc123" } },
  destination: { branch: { name: "stage" }, commit: { hash: "def456" } },
  created_on: "2026-05-01T00:00:00Z",
  updated_on: "2026-05-11T00:00:00Z",
  comment_count: 6,
  task_count: 1,
  reviewers: [
    { uuid: "{ann}", display_name: "Ann Chen" },
    { uuid: "{sm}", display_name: "sm" },
  ],
  participants: [
    {
      role: "REVIEWER",
      approved: true,
      state: "approved",
      user: { uuid: "{ann}", display_name: "Ann Chen" },
    },
    {
      role: "REVIEWER",
      approved: false,
      state: null,
      user: { uuid: "{sm}", display_name: "sm" },
    },
  ],
  links: { self: [{ href: "https://api.bitbucket.org/..." }] },
  summary: { raw: "raw summary", html: "<p>noisy html</p>" },
  rendered: { description: { raw: "rendered raw", html: "<p>html dup</p>" } },
};

describe("pullRequestSummary", () => {
  it("strips links, html, and full participant nesting", () => {
    const s = pullRequestSummary(samplePr);
    expect(JSON.stringify(s)).not.toContain("api.bitbucket.org");
    expect(JSON.stringify(s)).not.toContain("html");
    expect(s.author?.display_name).toBe("Roman Trusov");
    // Reviewer state derived from participants when present.
    expect(s.reviewers).toEqual([
      { uuid: "{ann}", display_name: "Ann Chen", approved: true, state: "approved" },
      { uuid: "{sm}", display_name: "sm", approved: false, state: undefined },
    ]);
    expect(s.source).toEqual({ branch: "feature/prom", commit: "abc123" });
    expect(s.destination).toEqual({ branch: "stage", commit: "def456" });
  });

  it("uses bare reviewers list when participants absent", () => {
    const pr = { ...samplePr, participants: undefined };
    const s = pullRequestSummary(pr);
    expect(s.reviewers).toEqual([
      { uuid: "{ann}", display_name: "Ann Chen", approved: false },
      { uuid: "{sm}", display_name: "sm", approved: false },
    ]);
  });

  it("size reduction: PR summary < 25% of raw response", () => {
    const raw = JSON.stringify(samplePr);
    const trimmed = JSON.stringify(pullRequestSummary(samplePr));
    expect(trimmed.length).toBeLessThan(raw.length * 0.6);
  });
});

describe("pullRequestRow + pullRequestListSummary", () => {
  it("compact row preserves the fields the agent typically picks on", () => {
    const row = pullRequestRow(samplePr);
    expect(row).toEqual({
      id: 39636,
      title: "MON-743: prometheus endpoints",
      state: "OPEN",
      author: {
        uuid: "{abc}",
        display_name: "Roman Trusov",
        nickname: "rtrusov",
        type: "user",
      },
      source_branch: "feature/prom",
      destination_branch: "stage",
      updated_on: "2026-05-11T00:00:00Z",
      comment_count: 6,
    });
  });

  it("list summary wraps rows and surfaces pagination cursor", () => {
    const list = pullRequestListSummary({
      page: 1,
      pagelen: 10,
      size: 47,
      next: "https://api.bitbucket.org/2.0/repositories/x/y/pullrequests?page=2",
      values: [samplePr],
    });
    expect(list.total).toBe(47);
    expect(list.page).toBe(1);
    expect(list.next).toContain("page=2");
    expect(list.values).toHaveLength(1);
  });
});

describe("repositorySummary + repositoryListSummary", () => {
  const repo: BitbucketRepository = {
    uuid: "{r}",
    name: "thing",
    full_name: "myws/thing",
    is_private: true,
    created_on: "2026-01-01T00:00:00Z",
    updated_on: "2026-04-01T00:00:00Z",
    language: "TypeScript",
    size: 1234,
    mainbranch: { name: "main", type: "branch" },
    owner: { uuid: "{o}", display_name: "Owner", type: "team" },
    workspace: { uuid: "{w}", name: "MyWS", slug: "myws" },
    project: { uuid: "{p}", key: "PROJ", name: "Project X" },
    links: { self: [{ href: "https://x" }] },
    description: "a thing",
  };

  it("collapses workspace/project to slug+name only", () => {
    const s = repositorySummary(repo);
    expect(s.workspace).toEqual({ slug: "myws", name: "MyWS" });
    expect(s.project).toEqual({ key: "PROJ", name: "Project X" });
    expect(s.mainbranch).toBe("main");
    expect(JSON.stringify(s)).not.toContain("links");
  });

  it("row drops description + workspace + project", () => {
    const r = repositoryRow(repo);
    expect("description" in r).toBe(false);
    expect("workspace" in r).toBe(false);
  });

  it("list summary wraps rows + pagination", () => {
    const list = repositoryListSummary({
      page: 1,
      pagelen: 10,
      size: 5,
      next: undefined,
      values: [repo],
    });
    expect(list.total).toBe(5);
    expect(list.values).toHaveLength(1);
  });
});

describe("commitSummary + commitRow", () => {
  const commit: BitbucketCommit = {
    hash: "9f8e7d6abcdef1234567890",
    message: "MON-743: add prom endpoints\n\nLong body here",
    date: "2026-05-10T00:00:00Z",
    author: {
      raw: "Roman Trusov <r@example.com>",
      user: { uuid: "{r}", display_name: "Roman" },
    },
    parents: [{ hash: "parent1" }, { hash: "parent2" }],
    links: { self: [{ href: "https://x" }] },
  };

  it("trims to first line + parents + author summary", () => {
    const s = commitSummary(commit);
    expect(s.short_hash).toBe("9f8e7d6");
    expect(s.message_first_line).toBe("MON-743: add prom endpoints");
    expect(s.parents).toEqual(["parent1", "parent2"]);
    expect(s.author?.display_name).toBe("Roman");
    expect(JSON.stringify(s)).not.toContain("links");
  });

  it("row drops parents + author summary; keeps author_raw", () => {
    const r = commitRow(commit);
    expect("parents" in r).toBe(false);
    expect(r.author_raw).toBe("Roman Trusov <r@example.com>");
  });
});

describe("commentSummary + commentRow + commentListSummary", () => {
  const comment: BitbucketComment = {
    id: 1234,
    user: { uuid: "{u}", display_name: "Ann Chen" },
    content: { raw: "Looks good but...", html: "<p>noisy</p>" },
    created_on: "2026-05-10T12:00:00Z",
    updated_on: "2026-05-10T12:30:00Z",
    inline: { path: "src/auth/Client.ts", from: 50, to: 57 },
    parent: { id: 1230 },
    resolution: null,
    deleted: false,
    links: { self: [{ href: "https://x" }] },
  };

  it("uses raw content, drops html and links", () => {
    const s = commentSummary(comment);
    expect(s.body).toBe("Looks good but...");
    expect(s.inline).toEqual({ path: "src/auth/Client.ts", from: 50, to: 57 });
    expect(s.parent_id).toBe(1230);
    expect(JSON.stringify(s)).not.toContain("html");
    expect(JSON.stringify(s)).not.toContain("links");
  });

  it("row gives a one-line excerpt + path", () => {
    const r = commentRow(comment);
    expect(r.body_first_line).toBe("Looks good but...");
    expect(r.inline_path).toBe("src/auth/Client.ts");
  });

  it("list summary preserves pagination", () => {
    const list = commentListSummary({
      page: 1,
      pagelen: 10,
      size: 6,
      values: [comment],
    });
    expect(list.total).toBe(6);
    expect(list.values).toHaveLength(1);
  });
});
