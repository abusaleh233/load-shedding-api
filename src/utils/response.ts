import { Response } from "express";

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
