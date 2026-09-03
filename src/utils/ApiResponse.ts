import { Response } from "express";
import { successResponse } from "./response";

/**
 * Thin, chainable class wrapper over the plain successResponse() helper in
 * response.ts — kept because controllers read more clearly as
 * `ApiResponse.created(res, data, "...")` than a bare function call at
 * every call site. Both ultimately produce the identical mandatory shape:
 * { success: true, message, data }.
 */
export class ApiResponse {
  static success<T>(
    res: Response,
    data: T,
    message = "Request successful",
    statusCode = 200
  ): Response {
    return successResponse(res, data, message, statusCode);
  }

  static created<T>(res: Response, data: T, message = "Resource created successfully"): Response {
    return this.success(res, data, message, 201);
  }

  static noContent(res: Response, message = "Operation successful"): Response {
    return successResponse(res, null, message, 200);
  }
}
