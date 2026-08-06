import type { ApiError } from "@newellai/contracts";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "INTEGRITY_ERROR"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  INVALID_JSON: 400,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  INTEGRITY_ERROR: 409,
  INTERNAL_ERROR: 500,
};

export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function toApiError(error: unknown): { body: ApiError; status: number } {
  if (error instanceof HttpError) {
    const body: ApiError = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    };
    return { body, status: error.status };
  }

  const body: ApiError = {
    error: {
      code: "INTERNAL_ERROR",
      message: "Unexpected server error",
    },
  };
  return { body, status: 500 };
}

export function jsonResponse(
  data: unknown,
  status = 200,
  initHeaders?: HeadersInit,
): Response {
  const headers = new Headers(initHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers });
}

export function errorResponse(error: unknown): Response {
  const { body, status } = toApiError(error);
  const headers: Record<string, string> = {};
  if (error instanceof HttpError && error.code === "UNAUTHORIZED") {
    headers["WWW-Authenticate"] = "Bearer";
  }
  return jsonResponse(body, status, headers);
}
