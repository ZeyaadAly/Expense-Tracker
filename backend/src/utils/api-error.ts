export interface FieldError { field: string; message: string }

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: FieldError[] = [],
    public readonly headers: Record<string, string> = {},
  ) { super(message); }
}

export function validationError(details: FieldError[]): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", "Check the highlighted fields.", details);
}

export function databaseUnavailable(): ApiError {
  return new ApiError(503, "DATABASE_UNAVAILABLE", "Database is unavailable. Please try again later.");
}
