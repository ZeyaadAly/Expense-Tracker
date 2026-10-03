import type { RequestHandler } from "express";
import { ApiError, validationError } from "../utils/api-error.js";

export const requestPolicy: RequestHandler = (request, _response, next) => {
  if (["POST", "PUT"].includes(request.method) && !request.is("application/json")) {
    next(new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Use Content-Type: application/json.")); return;
  }
  if (["GET", "HEAD", "DELETE"].includes(request.method) &&
      ((request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0") || request.headers["transfer-encoding"] !== undefined)) {
    next(validationError([{field:"body",message:"This method does not accept a request body."}])); return;
  }
  next();
};

export function methodNotAllowed(methods: readonly string[]): RequestHandler {
  return (_request, _response, next) => next(new ApiError(405, "METHOD_NOT_ALLOWED", "This HTTP method is not supported.", [], {Allow: methods.join(", ")}));
}

export function allowMethods(methods: readonly string[]): RequestHandler {
  const reject = methodNotAllowed(methods);
  return (request, response, next) => {
    if (methods.includes(request.method)) next();
    else reject(request, response, next);
  };
}

export const routeNotFound: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, "ROUTE_NOT_FOUND", "API route not found."));
};
