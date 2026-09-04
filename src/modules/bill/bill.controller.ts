import { Request, Response } from "express";
import { BillStatus } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import * as billService from "./bill.service";

export const createBill = asyncHandler(async (req: Request, res: Response) => {
  const bill = await billService.createBill(req.user!.sub, req.body);
  ApiResponse.created(res, bill, "Bill created successfully");
});

export const listBills = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const userId = req.query.userId as string | undefined;
  const areaId = req.query.areaId as string | undefined;
  const status = req.query.status as BillStatus | undefined;

  const result = await billService.listBills(
    { id: req.user!.sub, role: req.user!.role },
    { page, limit, userId, areaId, status }
  );
  ApiResponse.success(res, result, "Bills retrieved successfully");
});

export const getBill = asyncHandler(async (req: Request, res: Response) => {
  const bill = await billService.getBillById({ id: req.user!.sub, role: req.user!.role }, req.params.id);
  ApiResponse.success(res, bill, "Bill retrieved successfully");
});

export const updateBill = asyncHandler(async (req: Request, res: Response) => {
  const bill = await billService.updateBill(req.user!.sub, req.params.id, req.body);
  ApiResponse.success(res, bill, "Bill updated successfully");
});

export const deleteBill = asyncHandler(async (req: Request, res: Response) => {
  await billService.softDeleteBill(req.user!.sub, req.params.id);
  ApiResponse.success(res, null, "Bill deleted successfully");
});