import { describe, expect, it } from "vitest";

import { pullRequestTool } from "./pullrequest.js";

// The interesting part of `pullrequest.ts` is the Zod `.transform()`
// on merge/comment_add/comment_update: callers pass flat args
// (content as string, parent_id, inline_path/to/from, etc.) and we
// reshape to Bitbucket's nested body. Verify the shape is right.

describe("pullRequestTool action schemas", () => {
  it("declares the cherry-picked Phase 3 action set", () => {
    expect(Object.keys(pullRequestTool.actions).sort()).toEqual(
      [
        "approve",
        "comment_add",
        "comment_delete",
        "comment_update",
        "comments_list",
        "decline",
        "get",
        "list",
        "merge",
        "unapprove",
      ].sort(),
    );
  });

  it("approve / unapprove / decline take just the PR identifier", () => {
    const args = { workspace: "w", repo_slug: "r", pr_id: 1 };
    for (const action of ["approve", "unapprove", "decline"] as const) {
      const parsed = pullRequestTool.actions[action].schema!.parse(args);
      expect(parsed).toEqual(args);
    }
  });
});

describe("MergeSchema transform", () => {
  it("injects the required `type` field and passes merge_strategy through", () => {
    const parsed = pullRequestTool.actions.merge.schema!.parse({
      workspace: "w",
      repo_slug: "r",
      pr_id: 1,
      merge_strategy: "squash",
      close_source_branch: true,
    });
    expect(parsed).toEqual({
      workspace: "w",
      repo_slug: "r",
      pr_id: 1,
      type: "pullrequest_merge_parameters",
      message: undefined,
      close_source_branch: true,
      merge_strategy: "squash",
    });
  });

  it("rejects an unknown merge_strategy", () => {
    expect(() =>
      pullRequestTool.actions.merge.schema!.parse({
        workspace: "w",
        repo_slug: "r",
        pr_id: 1,
        merge_strategy: "rebase",
      }),
    ).toThrow();
  });
});

describe("CommentAddSchema transform", () => {
  it("reshapes flat content to nested { content: { raw } }", () => {
    const parsed = pullRequestTool.actions.comment_add.schema!.parse({
      workspace: "w",
      repo_slug: "r",
      pr_id: 1,
      content: "looks good",
    });
    expect(parsed).toEqual({
      workspace: "w",
      repo_slug: "r",
      pr_id: 1,
      content: { raw: "looks good" },
    });
  });

  it("packs parent_id into { parent: { id } } for replies", () => {
    const parsed = pullRequestTool.actions.comment_add.schema!.parse({
      workspace: "w",
      repo_slug: "r",
      pr_id: 1,
      content: "+1",
      parent_id: 42,
    });
    expect(parsed).toMatchObject({ parent: { id: 42 } });
  });

  it("packs inline_path/to/from into { inline: { path, to, from } }", () => {
    const parsed = pullRequestTool.actions.comment_add.schema!.parse({
      workspace: "w",
      repo_slug: "r",
      pr_id: 1,
      content: "nit",
      inline_path: "src/foo.ts",
      inline_to: 42,
    });
    expect(parsed).toMatchObject({
      inline: { path: "src/foo.ts", to: 42 },
    });
    expect(parsed).not.toHaveProperty("inline_path");
  });

  it("omits inline when no inline_* fields are passed", () => {
    const parsed = pullRequestTool.actions.comment_add.schema!.parse({
      workspace: "w",
      repo_slug: "r",
      pr_id: 1,
      content: "general comment",
    });
    expect(parsed).not.toHaveProperty("inline");
    expect(parsed).not.toHaveProperty("parent");
  });
});

describe("CommentUpdateSchema transform", () => {
  it("reshapes content string into nested { content: { raw } }", () => {
    const parsed = pullRequestTool.actions.comment_update.schema!.parse({
      workspace: "w",
      repo_slug: "r",
      pr_id: 1,
      comment_id: 7,
      content: "edited",
    });
    expect(parsed).toEqual({
      workspace: "w",
      repo_slug: "r",
      pr_id: 1,
      comment_id: 7,
      content: { raw: "edited" },
    });
  });
});

describe("positiveInt acceptance", () => {
  it("comment_add accepts pr_id as numeric string (the LLM-input case)", () => {
    const parsed = pullRequestTool.actions.comment_add.schema!.parse({
      workspace: "w",
      repo_slug: "r",
      pr_id: "39636",
      content: "x",
    });
    expect(parsed).toMatchObject({ pr_id: 39636 });
  });
});
