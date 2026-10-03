import type { ErrorRequestHandler } from "express";
import { ApiError, databaseUnavailable, validationError } from "../utils/api-error.js";

const unavailableCodes = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "08000", "08001", "08003", "08004", "08006", "08007", "08P01", "57P01", "57P02", "57P03", "53300"]);
const constraintFields: Record<string, string> = {
  transactions_type_check: "type",
  transactions_amount_range_check: "amount",
  transactions_amount_scale_check: "amount",
  transactions_description_check: "description",
  transactions_category_check: "category",
  transactions_date_min_check: "date",
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) { next(error); return; }
  const known = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
  let publicError: ApiError;
  if (error instanceof ApiError) publicError = error;
  else if (known.type === "entity.too.large") publicError = new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds 16 KiB.");
  else if (known.type === "entity.parse.failed") publicError = new ApiError(400, "INVALID_JSON", "Provide valid JSON.");
  else if (known.status === 415) publicError = new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Use application/json with UTF-8 encoding.");
  else if (known.code === "23514" && typeof known.constraint === "string" && Object.hasOwn(constraintFields, known.constraint)) {
    const field = constraintFields[known.constraint];
    publicError = validationError([{ field, message: "This value does not meet the transaction rules." }]);
  }
  else if (typeof known.code === "string" && unavailableCodes.has(known.code)) publicError = databaseUnavailable();
  else {
    // Never log arbitrary error objects: driver errors can contain credentials or SQL.
    console.error("Unexpected API error");
    publicError = new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again later.");
  }
  response.set(publicError.headers).status(publicError.status).json({ error: {
    code: publicError.code, message: publicError.message, details: publicError.details,
  } });
};
