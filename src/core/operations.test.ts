import { describe, expect, it } from "vitest";

import { extractPathParams } from "@scottlepp/mcp-toolkit/manifest";

import { operations } from "./operations.js";
import { trimRegistry } from "./trim-registry.js";

describe("operations manifest", () => {
  it("every operation has a unique name", () => {
    const seen = new Set<string>();
    for (const op of operations) {
      expect(seen.has(op.name), `duplicate operation name: ${op.name}`).toBe(false);
      seen.add(op.name);
    }
  });

  it("every path-template placeholder appears as a role=path param", () => {
    for (const op of operations) {
      const placeholders = extractPathParams(op.pathTemplate);
      for (const ph of placeholders) {
        const spec = op.params.find((p) => p.name === ph);
        expect(spec, `${op.name}: placeholder {${ph}} has no matching param`).toBeDefined();
        expect(spec?.role, `${op.name}: {${ph}} should be role=path`).toBe("path");
        expect(spec?.required, `${op.name}: {${ph}} should be required`).toBe(true);
      }
    }
  });

  it("every `trim:` value exists in the local trimRegistry", () => {
    for (const op of operations) {
      if (op.trim !== undefined) {
        expect(
          op.trim in trimRegistry,
          `${op.name}: trim="${op.trim}" not registered`,
        ).toBe(true);
      }
    }
  });

  it("operation names follow `<resource>.<action>` convention", () => {
    for (const op of operations) {
      expect(
        op.name,
        `${op.name}: should match <resource>.<action>`,
      ).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });
});
