import { Response } from "express";

/**
 * Single source of truth for the mandatory response envelope:
 *   Success: { success: true,  message: string, data: {} }
 *   Error:   { success: false, message: string, errors: [] }
 *
 * Every other response helper in the codebase (ApiResponse.ts for
 * controllers, error.middleware.ts for the global error handler) delegates
 * to these two functions rather than building the JSON shape itself, so
 * there is exactly one place that shape is defined.
 */

export interface ApiErrorItem {
  field?: string;
  message: string;
}

export function successResponse<T>(
  res: Response,
  data: T,
  message = "Request successful",
  statusCode = 200
): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function errorResponse(
  res: Response,
  message: string,
  errors: ApiErrorItem[] = [],
  statusCode = 500
): Response {
  return res.status(statusCode).json({
    success: false,
    message,
    errors: errors.length > 0 ? errors : [{ message }],
  });
}
