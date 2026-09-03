import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/ApiError";
import { errorResponse, ApiErrorItem } from "../utils/response";
import { logger } from "../utils/logger";
import { env } from "../config/env";

/** 404 fallback for unmatched routes. */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

/**
 * Single source of truth for the mandatory error response shape:
 * { success: false, message: string, errors: [] }
 * Normalizes ApiError, Prisma errors, and unexpected exceptions alike.
 */
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = 500;
  let message = "Internal server error";
  let errors: ApiErrorItem[] = [];

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        statusCode = 409;
        message = `A record with this ${(err.meta?.target as string[])?.join(", ") ?? "value"} already exists`;
        break;
      case "P2025":
        statusCode = 404;
        message = "Related record not found";
        break;
      case "P2003":
        statusCode = 409;
        message = "Operation violates a foreign key / referential constraint";
        break;
      default:
        statusCode = 400;
        message = "Database request error";
    }
    errors = [{ message }];
  } else if (err instanceof Error) {
    message = env.NODE_ENV === "production" ? message : err.message;
    errors = [{ message }];
  }

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${statusCode}: ${(err as Error)?.stack ?? err}`);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${statusCode}: ${message}`);
  }

  errorResponse(res, message, errors, statusCode);
};
