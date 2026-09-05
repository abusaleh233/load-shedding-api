import { ApiErrorItem } from "./response";

export class ApiError extends Error {
  public statusCode: number;
  public errors: ApiErrorItem[];
  public isOperational: boolean;

  constructor(statusCode: number, message: string, errors: ApiErrorItem[] = [], stack = "") {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors.length > 0 ? errors : [{ message }];
    this.isOperational = true;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static badRequest(message: string, errors: ApiErrorItem[] = []) {
    return new ApiError(400, message, errors);
  }
  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, message);
  }
  static forbidden(message = "Forbidden: insufficient permissions") {
    return new ApiError(403, message);
  }
  static notFound(message = "Resource not found") {
    return new ApiError(404, message);
  }
  static conflict(message: string) {
    return new ApiError(409, message);
  }
  static internal(message = "Internal server error") {
    return new ApiError(500, message);
  }
}
