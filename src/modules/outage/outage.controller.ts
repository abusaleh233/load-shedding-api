import { Request, Response } from "express";
import { OutageType, OutageLogStatus } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import * as outageService from "./outage.service";

export const createOutage = asyncHandler(async (req: Request, res: Response) => {
  const outage = await outageService.createOutage(req.user!.sub, req.user!.role, req.body);
  ApiResponse.created(res, outage, "Outage recorded successfully");
});

export const getLiveOutages = asyncHandler(async (_req: Request, res: Response) => {
  const outages = await outageService.getLiveOutages();
  ApiResponse.success(res, outages, "Live outages retrieved successfully");
});

export const listOutages = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const areaId = req.query.areaId as string | undefined;
  const type = req.query.type as OutageType | undefined;
  const status = req.query.status as OutageLogStatus | undefined;

  const result = await outageService.listOutages({ page, limit, areaId, type, status });
  ApiResponse.success(res, result, "Outages retrieved successfully");
});

export const getOutage = asyncHandler(async (req: Request, res: Response) => {
  const outage = await outageService.getOutageById(req.params.id);
  ApiResponse.success(res, outage, "Outage retrieved successfully");
});

export const updateOutage = asyncHandler(async (req: Request, res: Response) => {
  const outage = await outageService.updateOutage(req.user!.sub, req.params.id, req.body);
  ApiResponse.success(res, outage, "Outage updated successfully");
});

export const deleteOutage = asyncHandler(async (req: Request, res: Response) => {
  await outageService.softDeleteOutage(req.user!.sub, req.params.id);
  ApiResponse.success(res, null, "Outage deleted successfully");
});
