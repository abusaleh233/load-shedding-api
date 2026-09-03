import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import * as authService from "./auth.service";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.registerUser(req.body, req.ip);
  ApiResponse.created(res, result, "User registered successfully");
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.loginUser(req.body, req.ip);
  ApiResponse.success(res, result, "Login successful");
});

export const googleLogin = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.loginWithGoogle(req.body.idToken, req.ip);
  ApiResponse.success(res, result, "Google login successful");
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.refreshTokens(req.body.refreshToken, req.ip);
  ApiResponse.success(res, result, "Token refreshed successfully");
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logoutUser(req.body.refreshToken);
  ApiResponse.success(res, null, "Logged out successfully");
});
