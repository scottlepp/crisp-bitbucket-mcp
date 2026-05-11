// BitbucketClient — implements the SDK's Client interface against
// Bitbucket Cloud's REST 2.0 API (api.bitbucket.org/2.0).
//
// Auth: App Password (HTTP Basic, username:password) or API Token
// (Bearer). Auto-detected from BitbucketConfig.
//
// Builds undici-based requests. The Client interface returns
// Promise<unknown>; callers (operations + trim functions) narrow.

import { request } from "undici";

import type {
  Client,
  QueryParams,
} from "@scottlepp/mcp-toolkit/client";
import type { BitbucketAuth } from "../config.js";
import type { BitbucketErrorResponse } from "../types/bitbucket.js";

const API_BASE = "https://api.bitbucket.org/2.0";

export class BitbucketApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response?: BitbucketErrorResponse,
  ) {
    super(message);
    this.name = "BitbucketApiError";
  }
}

export interface BitbucketClientOpts {
  auth: BitbucketAuth;
  // Override the API base URL. Defaults to the public cloud endpoint.
  // Useful for tests against a recorded fixtures server.
  apiBase?: string;
  // Override the user-agent. Defaults to a stable token-efficient
  // string that Bitbucket can use to identify our traffic.
  userAgent?: string;
}

export class BitbucketClient implements Client {
  private readonly auth: BitbucketAuth;
  private readonly apiBase: string;
  private readonly userAgent: string;

  constructor(opts: BitbucketClientOpts) {
    this.auth = opts.auth;
    this.apiBase = opts.apiBase ?? API_BASE;
    this.userAgent = opts.userAgent ?? "scottlepp-crisp-bitbucket-mcp/0.1";
  }

  async get(path: string, queryParams?: QueryParams): Promise<unknown> {
    return this.request({ method: "GET", path, queryParams });
  }

  // Variant for endpoints that return text/plain (e.g. /diff). Always
  // returns the raw response body as a string; doesn't try to parse
  // as JSON. Throws BitbucketApiError on non-2xx (best-effort JSON
  // body decode for the error path).
  async getText(path: string, queryParams?: QueryParams): Promise<string> {
    return this.request({
      method: "GET",
      path,
      queryParams,
      accept: "text/plain",
      raw: true,
    }) as Promise<string>;
  }
  async post(
    path: string,
    body?: unknown,
    queryParams?: QueryParams,
  ): Promise<unknown> {
    return this.request({ method: "POST", path, body, queryParams });
  }
  async put(
    path: string,
    body?: unknown,
    queryParams?: QueryParams,
  ): Promise<unknown> {
    return this.request({ method: "PUT", path, body, queryParams });
  }
  async delete(path: string, queryParams?: QueryParams): Promise<unknown> {
    return this.request({ method: "DELETE", path, queryParams });
  }

  // --- Internal ------------------------------------------------------

  private buildUrl(
    path: string,
    queryParams?: QueryParams,
  ): string {
    const url = new URL(`${this.apiBase}${path}`);
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value === undefined) continue;
        url.searchParams.append(key, String(value));
      }
    }
    return url.toString();
  }

  private authHeader(): string {
    if (this.auth.kind === "api-token") {
      return `Bearer ${this.auth.token}`;
    }
    const credentials = Buffer.from(
      `${this.auth.username}:${this.auth.password}`,
    ).toString("base64");
    return `Basic ${credentials}`;
  }

  private async request(opts: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    queryParams?: QueryParams;
    body?: unknown;
    // When set, override the Accept header (default "application/json").
    accept?: string;
    // When true, return the raw response text on success instead of
    // parsing as JSON. Used by getText() for /diff endpoints.
    raw?: boolean;
  }): Promise<unknown> {
    const url = this.buildUrl(opts.path, opts.queryParams);
    const headers: Record<string, string> = {
      Authorization: this.authHeader(),
      Accept: opts.accept ?? "application/json",
      "User-Agent": this.userAgent,
    };
    let bodyPayload: string | undefined;
    if (opts.body !== undefined && opts.method !== "GET" && opts.method !== "DELETE") {
      headers["Content-Type"] = "application/json";
      bodyPayload = JSON.stringify(opts.body);
    }

    const res = await request(url, {
      method: opts.method,
      headers,
      body: bodyPayload,
      // Bitbucket Cloud's /diff endpoint 302-redirects to a signed
      // CDN URL. Follow redirects so the response body is the actual
      // diff, not the redirect notice.
      maxRedirections: 5,
    });
    const statusCode = res.statusCode;
    const text = await res.body.text();

    if (statusCode === 204) {
      return opts.raw ? "" : {};
    }

    // Best-effort JSON parse for the error path even when raw=true,
    // so we can surface a structured error message.
    let parsed: unknown = undefined;
    let parseError: Error | null = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        parseError = err as Error;
      }
    }

    const ok = statusCode >= 200 && statusCode < 300;
    if (!ok) {
      const errResp = (parsed ?? undefined) as
        | BitbucketErrorResponse
        | undefined;
      const msg =
        errResp?.error?.message ??
        errResp?.error?.detail ??
        (text || `HTTP ${statusCode}`);
      throw new BitbucketApiError(msg, statusCode, errResp);
    }

    // raw mode: return the body verbatim regardless of content type.
    if (opts.raw) {
      return text;
    }
    // Successful non-JSON response (rare for JSON endpoints).
    if (parseError) {
      return text;
    }
    return parsed ?? {};
  }
}
