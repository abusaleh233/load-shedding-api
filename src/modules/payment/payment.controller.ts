import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import * as paymentService from "./payment.service";

export const createCheckoutSession = asyncHandler(async (req: Request, res: Response) => {
  const result = await paymentService.createCheckoutSession(req.user!.sub, req.user!.email, req.body.billId);
  ApiResponse.created(res, result, "Checkout session created successfully");
});

/**
 * POST /api/v1/payments/webhook
 * NOTE: receives the raw Buffer body — see app.ts, where express.raw() is
 * mounted for this exact path ahead of the global express.json() parser.
 * Stripe signature verification fails on an already-parsed/re-serialized
 * body, so this handler must never be reached through the JSON middleware.
 */
export const stripeWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;
  const result = await paymentService.handleWebhookEvent(req.body as Buffer, signature);
  res.status(200).json(result);
});

export const getPaymentHistory = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const result = await paymentService.listOwnPayments(req.user!.sub, page, limit);
  ApiResponse.success(res, result, "Payment history retrieved successfully");
});

export const listAllPayments = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const result = await paymentService.listAllPayments(page, limit);
  ApiResponse.success(res, result, "All payments retrieved successfully");
});
