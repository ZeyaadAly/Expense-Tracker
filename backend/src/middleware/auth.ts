import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, errors, type RemoteJWKSetOptions } from "jose";
import { readAuthConfig } from "../config/auth.js";
import type { AuthContext } from "../types/auth.js";
import { ApiError } from "../utils/api-error.js";

const invalid = () => new ApiError(401, "AUTH_INVALID", "Your session is no longer valid. Sign in again.");
const unavailable = () => new ApiError(503, "AUTH_UNAVAILABLE", "Authentication is temporarily unavailable. Please try again later.");
export function createTokenVerifier(supabaseUrl: string | undefined, options: RemoteJWKSetOptions = {}) {
  const config = readAuthConfig(supabaseUrl);
  // One process-local resolver per middleware instance; no per-request key fetching.
  const keys = createRemoteJWKSet(config.jwksUrl, { cacheMaxAge: 600_000, cooldownDuration: 30_000, timeoutDuration: 5_000, ...options });
  return async (token: string): Promise<AuthContext> => {
    try {
      const { payload, protectedHeader } = await jwtVerify(token, keys, {
        algorithms: [config.algorithm], issuer: config.issuer, audience: config.audience,
        requiredClaims: ["exp", "sub", "role"], clockTolerance: 0,
      });
      if (typeof protectedHeader.kid !== "string" || !protectedHeader.kid ||
          typeof payload.sub !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub) ||
          payload.role !== "authenticated") throw invalid();
      return Object.freeze({ userId: payload.sub.toLowerCase(), ...(typeof payload.email === "string" && payload.email ? { email: payload.email } : {}) });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid ||
          error instanceof errors.JWKInvalid || error instanceof TypeError || !(error instanceof errors.JOSEError)) throw unavailable();
      // HTTP/provider failures use JOSEError; token/claim/key-selection failures have specific subclasses.
      if (error.code === "ERR_JOSE_GENERIC") throw unavailable();
      throw invalid();
    }
  };
}

export function createRequireAuth(supabaseUrl: string | undefined, options: RemoteJWKSetOptions = {}): RequestHandler {
  let verify: ReturnType<typeof createTokenVerifier> | undefined;
  return async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    // Ignore any pre-existing context; only this verified token establishes identity.
    delete request.auth;
    const headers = request.rawHeaders.filter((_value, index, all) => index % 2 === 1 && all[index - 1].toLowerCase() === "authorization");
    if (headers.length !== 1 || !/^Bearer [A-Za-z0-9._~-]+$/i.test(headers[0])) {
      next(new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.")); return;
    }
    try {
      // Lazy configuration keeps V1 and public health independent of V2 Auth setup.
      if (!verify) {
        try { verify = createTokenVerifier(supabaseUrl, options); } catch { throw unavailable(); }
      }
      request.auth = await verify(headers[0].slice(7));
      next();
    } catch (error) { next(error); }
  };
}
