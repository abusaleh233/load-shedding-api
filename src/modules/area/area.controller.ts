import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import * as areaService from "./area.service";

export const createArea = asyncHandler(async (req: Request, res: Response) => {
  const area = await areaService.createArea(req.user!.sub, req.body);
  ApiResponse.created(res, area, "Area created successfully");
});

export const listAreas = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const substationId = req.query.substationId as string | undefined;
  const search = req.query.search as string | undefined;

  const result = await areaService.listAreas({ page, limit, substationId, search });
  ApiResponse.success(res, result, "Areas retrieved successfully");
});

export const getArea = asyncHandler(async (req: Request, res: Response) => {
  const area = await areaService.getAreaById(req.params.id);
  ApiResponse.success(res, area, "Area retrieved successfully");
});

export const updateArea = asyncHandler(async (req: Request, res: Response) => {
  const area = await areaService.updateArea(req.user!.sub, req.params.id, req.body);
  ApiResponse.success(res, area, "Area updated successfully");
});

export const deleteArea = asyncHandler(async (req: Request, res: Response) => {
  await areaService.softDeleteArea(req.user!.sub, req.params.id);
  ApiResponse.success(res, null, "Area deleted successfully");
});
