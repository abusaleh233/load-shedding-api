import { Request, Response } from "express";
import { SubstationStatus } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import * as substationService from "./substation.service";

export const createSubstation = asyncHandler(async (req: Request, res: Response) => {
  const substation = await substationService.createSubstation(req.user!.sub, req.body);
  ApiResponse.created(res, substation, "Substation created successfully");
});

export const listSubstations = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const status = req.query.status as SubstationStatus | undefined;
  const search = req.query.search as string | undefined;

  const result = await substationService.listSubstations({ page, limit, status, search });
  ApiResponse.success(res, result, "Substations retrieved successfully");
});

export const getSubstation = asyncHandler(async (req: Request, res: Response) => {
  const substation = await substationService.getSubstationById(req.params.id);
  ApiResponse.success(res, substation, "Substation retrieved successfully");
});

export const updateSubstation = asyncHandler(async (req: Request, res: Response) => {
  const substation = await substationService.updateSubstation(req.user!.sub, req.params.id, req.body);
  ApiResponse.success(res, substation, "Substation updated successfully");
});

export const deleteSubstation = asyncHandler(async (req: Request, res: Response) => {
  await substationService.softDeleteSubstation(req.user!.sub, req.params.id);
  ApiResponse.success(res, null, "Substation deleted successfully");
});
