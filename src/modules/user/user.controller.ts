import { Request, Response } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import * as userService from "./user.service";

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getUserById(req.user!.sub);
  ApiResponse.success(res, user, "Profile retrieved successfully");
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.updateOwnProfile(req.user!.sub, req.body);
  ApiResponse.success(res, user, "Profile updated successfully");
});

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const role = req.query.role as Role | undefined;
  const search = req.query.search as string | undefined;

  const result = await userService.listUsers({ page, limit, role, search });
  ApiResponse.success(res, result, "Users retrieved successfully");
});

export const updateUserRole = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.updateUserRole(req.user!.sub, req.params.id, req.body.role);
  ApiResponse.success(res, user, "User role updated successfully");
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  await userService.softDeleteUser(req.user!.sub, req.params.id);
  ApiResponse.success(res, null, "User deleted successfully");
});
