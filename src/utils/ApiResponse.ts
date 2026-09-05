import { Response } from "express";
import { successResponse } from "./response";


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
