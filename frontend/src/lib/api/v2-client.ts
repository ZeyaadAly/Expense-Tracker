"use client";

import { getAccessToken } from "../auth/auth-service";
import type { AuthResult } from "../auth/types";

export type V2ErrorKind = "auth" | "validation" | "network" | "server" | "unexpected" | "aborted";
export type V2ApiDetail = { field: string; message: string };
export type V2Envelope<T, M = unknown> = { data: T; meta?: M };
export type V2Query = Readonly<Record<string, string | number | boolean | null | undefined>>;
export type V2RequestOptions = { query?: V2Query; signal?: AbortSignal };

export class V2ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly kind: V2ErrorKind,
    public readonly details: V2ApiDetail[] = [],
    public readonly uncertain = false,
  ) {
    super(kind === "aborted" ? "Request canceled." : uncertain ? "We could not confirm whether the change was saved. Check your data before trying again." :
      code === "AUTH_REQUIRED" ? "Sign in to continue." : code === "AUTH_INVALID" ? "Your session is no longer valid. Sign in again." :
      code === "AUTH_UNAVAILABLE" ? "Authentication is temporarily unavailable. Please try again later." :
      kind === "validation" ? "Check the highlighted fields." : kind === "network" ? "Unable to connect. Please try again." :
      code === "CONFIGURATION_ERROR" ? "The API connection is not configured. Please contact the application owner." : "The request could not be completed. Please try again later.");
    this.name = "V2ApiError";
  }
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// Preserve the deployed V1 prefix contract; only this client normalizes it.
export function v2BaseUrl(base: string | undefined): string {
  try {
    const url = new URL(base ?? "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[\\\s]/.test(base ?? "")) throw new Error();
    const path = url.pathname.replace(/\/+$/, "");
    if (!["", "/api/v1", "/api/v2"].includes(path)) throw new Error();
    return `${url.origin}/api/v2`;
  } catch { throw new V2ApiError(0, "CONFIGURATION_ERROR", "unexpected"); }
}

export function v2QueryString(query: V2Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    if (!["string", "number", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) throw new V2ApiError(0, "INVALID_REQUEST", "unexpected");
    params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

type ClientConfig = { baseUrl?: string; fetcher?: typeof fetch; tokenSupplier?: () => Promise<AuthResult<string | null>> };

// Injection is for transport tests; pages use the default T06 supplier, never a token argument.
export function createV2ApiClient({ baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL, fetcher = fetch, tokenSupplier = getAccessToken }: ClientConfig = {}) {
  async function request<T, M = unknown>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body: unknown, options: V2RequestOptions = {}): Promise<V2Envelope<T, M> | undefined> {
    const write = method !== "GET";
    let sent = false;
    const canceled = () => new V2ApiError(0, "REQUEST_ABORTED", "aborted", [], write && sent);
    try {
      if (options.signal?.aborted) throw canceled();
      // Accept canonical relative paths only: no origin overrides, query fragments or traversal.
      if (!/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(path)) throw new V2ApiError(0, "INVALID_REQUEST", "unexpected");
      const url = v2BaseUrl(baseUrl) + path + v2QueryString(options.query);
      const serialized = body === undefined ? undefined : JSON.stringify(body);
      let token: AuthResult<string | null>;
      try { token = await tokenSupplier(); } catch { throw new V2ApiError(0, "AUTH_UNAVAILABLE", "server"); }
      if (options.signal?.aborted) throw canceled();
      if (token.error) throw new V2ApiError(0, "AUTH_UNAVAILABLE", "server");
      if (!token.data) throw new V2ApiError(0, "AUTH_REQUIRED", "auth");
      sent = true;
      const response = await fetcher(url, {
        method, body: serialized, signal: options.signal, cache: "no-store", credentials: "omit", redirect: "error",
        headers: { Accept: "application/json", Authorization: `Bearer ${token.data}`, ...(serialized === undefined ? {} : { "Content-Type": "application/json" }) },
      });
      if (response.status === 204) return undefined;
      let payload: unknown;
      try { payload = await response.json(); } catch (error) {
        if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw canceled();
        throw new V2ApiError(response.status, "INVALID_RESPONSE", "unexpected", [], write);
      }
      if (!response.ok) {
        if (object(payload) && object(payload.error) && typeof payload.error.code === "string" && typeof payload.error.message === "string" && Array.isArray(payload.error.details) && payload.error.details.every(d => object(d) && typeof d.field === "string" && typeof d.message === "string")) {
          const { code, details } = payload.error;
          const kind = response.status === 401 ? "auth" : response.status >= 500 ? "server" : code === "VALIDATION_ERROR" ? "validation" : "unexpected";
          throw new V2ApiError(response.status, code, kind, details.map(d => ({ field: d.field, message: d.message })), write && response.status >= 500 && response.status !== 503);
        }
        throw new V2ApiError(response.status, "INVALID_RESPONSE", "unexpected", [], write);
      }
      if (!object(payload) || !Object.hasOwn(payload, "data")) throw new V2ApiError(response.status, "INVALID_RESPONSE", "unexpected", [], write);
      // Domain validation belongs to later domain clients. Never coerce decimal strings.
      return { data: payload.data as T, ...(Object.hasOwn(payload, "meta") ? { meta: payload.meta as M } : {}) };
    } catch (error) {
      if (error instanceof V2ApiError) throw error;
      if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw canceled();
      throw new V2ApiError(0, sent ? "NETWORK_ERROR" : "INVALID_REQUEST", sent ? "network" : "unexpected", [], write && sent);
    }
  }
  return {
    get: <T, M = unknown>(path: string, options?: V2RequestOptions) => request<T, M>("GET", path, undefined, options),
    post: <T>(path: string, body: unknown, options?: V2RequestOptions) => request<T>("POST", path, body, options),
    put: <T>(path: string, body: unknown, options?: V2RequestOptions) => request<T>("PUT", path, body, options),
    delete: <T = never>(path: string, options?: V2RequestOptions) => request<T>("DELETE", path, undefined, options),
  };
}
