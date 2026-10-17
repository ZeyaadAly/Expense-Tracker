import type { RequestHandler } from "express";
import type { ReleaseConfig } from "../config/release.js";
import { ApiError } from "../utils/api-error.js";

export function createReleaseGate(config: ReleaseConfig | undefined): RequestHandler {
  const users = new Set(config?.acceptanceUserIds);
  return (request, _response, next) => {
    if (!config || config.stage === "public") return next();
    const unavailable = () => next(new ApiError(503, "MAINTENANCE", "Financial services are temporarily unavailable."));
    if (config.stage === "maintenance" || !request.auth || !users.has(request.auth.userId)) return unavailable();
    const bootstrap = request.method === "POST" && request.path === "/profile/bootstrap";
    if (config.stage === "read-only" && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !bootstrap) return unavailable();
    next();
  };
}
