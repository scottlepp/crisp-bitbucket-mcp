import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { Client } from "@scottlepp/mcp-toolkit/client";
import { createTrimRegistry } from "@scottlepp/mcp-toolkit/trim-registry";
import type { Manifest } from "@scottlepp/mcp-toolkit/manifest";

import {
  DispatchError,
  buildInputSchema,
  dispatch,
  type ConsolidatedToolDef,
} from "./dispatcher.js";

const manifest: Manifest = [
  {
    name: "thing.get",
    description: "fetch",
    verb: "GET",
    pathTemplate: "/things/{id}",
    params: [{ name: "id", role: "path", required: true }],
    trim: "thing",
  },
];

const trimRegistry = createTrimRegistry({
  thing: (x: unknown) => ({ trimmed: x }),
});

function makeStubClient(): Client {
  return {
    async get(path) {
      return { from: "get", path };
    },
    async post() { return {}; },
    async put() { return {}; },
    async delete() { return {}; },
  };
}

const tool: ConsolidatedToolDef = {
  name: "test_tool",
  description: "test",
  actions: {
    get: {
      operation: "thing.get",
      schema: z.object({ id: z.string() }),
      description: "fetch one",
    },
  },
};

describe("buildInputSchema", () => {
  it("declares action enum from action keys", () => {
    const schema = buildInputSchema(tool);
    expect(schema.required).toContain("action");
    expect(schema.properties.action.enum).toEqual(["get"]);
  });
});

describe("dispatch", () => {
  it("routes valid input to the manifest operation", async () => {
    const r = await dispatch(
      tool,
      { action: "get", id: "abc" },
      { manifest, client: makeStubClient(), trimRegistry },
    );
    expect(r.result).toEqual({ trimmed: { from: "get", path: "/things/abc" } });
  });

  it("throws DispatchError on missing action", async () => {
    await expect(
      dispatch(tool, { id: "abc" }, { manifest, client: makeStubClient(), trimRegistry }),
    ).rejects.toBeInstanceOf(DispatchError);
  });

  it("throws DispatchError on unknown action", async () => {
    await expect(
      dispatch(tool, { action: "bogus", id: "x" }, { manifest, client: makeStubClient(), trimRegistry }),
    ).rejects.toBeInstanceOf(DispatchError);
  });

  it("throws on invalid args via Zod", async () => {
    await expect(
      dispatch(tool, { action: "get", id: 42 }, { manifest, client: makeStubClient(), trimRegistry }),
    ).rejects.toThrow(/invalid args/);
  });

  it("preprocess hook fills in optional fields after validation", async () => {
    // Mirror the real-world pattern in index.ts: workspace is .optional()
    // on the schema, preprocess injects the default from BitbucketConfig.
    const toolWithOptional: ConsolidatedToolDef = {
      name: "test_tool",
      description: "test",
      actions: {
        get: {
          operation: "thing.get",
          schema: z.object({
            id: z.string(),
            workspace: z.string().optional(),
          }),
          description: "fetch one",
        },
      },
    };
    let capturedPath = "";
    const client: Client = {
      async get(path) {
        capturedPath = path;
        return { ok: true };
      },
      async post() { return {}; },
      async put() { return {}; },
      async delete() { return {}; },
    };

    const manifestWithWorkspace: Manifest = [
      {
        name: "thing.get",
        description: "fetch",
        verb: "GET",
        pathTemplate: "/workspaces/{workspace}/things/{id}",
        params: [
          { name: "workspace", role: "path", required: true },
          { name: "id", role: "path", required: true },
        ],
        trim: "thing",
      },
    ];

    await dispatch(
      toolWithOptional,
      { action: "get", id: "abc" },
      {
        manifest: manifestWithWorkspace,
        client,
        trimRegistry,
        preprocess: (_op, args) =>
          args.workspace ? args : { ...args, workspace: "default-ws" },
      },
    );
    expect(capturedPath).toBe("/workspaces/default-ws/things/abc");
  });
});
