// Bitbucket-Cloud-flavored HTTP client.
//
// Thin adapter over the SDK's `createHttpClient`: translates the
// project-local `BitbucketAuth` shape (app-password / api-token)
// into the SDK's auth (basic / bearer), supplies the default base
// URL + user-agent, and re-exports the SDK's HttpClient + error
// types so consumers don't need a second import.

import {
  createHttpClient,
  HttpClientError,
  type HttpClient,
} from "@scottlepp/mcp-toolkit/http-client";

import type { BitbucketAuth } from "../config.js";

const DEFAULT_API_BASE = "https://api.bitbucket.org/2.0";
const DEFAULT_USER_AGENT = "scottlepp-ultra-bitbucket-mcp/0.1";

export interface BitbucketClientOpts {
  auth: BitbucketAuth;
  // Override the API base URL. Defaults to the public cloud endpoint.
  // Useful for tests against a recorded-fixtures server.
  apiBase?: string;
  userAgent?: string;
}

export function createBitbucketClient(opts: BitbucketClientOpts): HttpClient {
  return createHttpClient({
    baseUrl: opts.apiBase ?? DEFAULT_API_BASE,
    userAgent: opts.userAgent ?? DEFAULT_USER_AGENT,
    auth:
      opts.auth.kind === "api-token"
        ? { kind: "bearer", token: opts.auth.token }
        : {
            kind: "basic",
            username: opts.auth.username,
            password: opts.auth.password,
          },
  });
}

// Re-export so callers can `import { HttpClient } from "../auth/bitbucket-client.js"`
// instead of pulling from the SDK directly.
export type { HttpClient } from "@scottlepp/mcp-toolkit/http-client";

// Backwards-compatible alias for the old class-based error name. The
// SDK's HttpClientError carries the same shape (statusCode, response).
export { HttpClientError as BitbucketApiError };
