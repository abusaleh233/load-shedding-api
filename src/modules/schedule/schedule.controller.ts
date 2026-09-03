import { Request, Response } from "express";
import { ScheduleStatus } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import * as scheduleService from "./schedule.service";

export const createSchedule = asyncHandler(async (req: Request, res: Response) => {
  const schedule = await scheduleService.createSchedule(req.user!.sub, req.body);
  ApiResponse.created(res, schedule, "Schedule created successfully");
});

export const listSchedules = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const areaId = req.query.areaId as string | undefined;
  const status = req.query.status as ScheduleStatus | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const result = await scheduleService.listSchedules({ page, limit, areaId, status, from, to });
  ApiResponse.success(res, result, "Schedules retrieved successfully");
});

export const getSchedule = asyncHandler(async (req: Request, res: Response) => {
  const schedule = await scheduleService.getScheduleById(req.params.id);
  ApiResponse.success(res, schedule, "Schedule retrieved successfully");
});

export const updateSchedule = asyncHandler(async (req: Request, res: Response) => {
  const schedule = await scheduleService.updateSchedule(req.user!.sub, req.params.id, req.body);
  ApiResponse.success(res, schedule, "Schedule updated successfully");
});

export const deleteSchedule = asyncHandler(async (req: Request, res: Response) => {
  await scheduleService.softDeleteSchedule(req.user!.sub, req.params.id);
  ApiResponse.success(res, null, "Schedule deleted successfully");
});
