import { z } from "zod";
import { BillStatus } from "@prisma/client";

export const createBillSchema = z.object({
  body: z
    .object({
      userId: z.string().uuid("Invalid userId"),
      areaId: z.string().uuid("Invalid areaId"),
      billingPeriodStart: z.coerce.date(),
      billingPeriodEnd: z.coerce.date(),
      unitsConsumedKWh: z.number().positive("unitsConsumedKWh must be greater than zero"),
      amountDue: z.number().int().positive("amountDue must be a positive integer (smallest currency unit)"),
      currency: z.string().trim().toLowerCase().length(3).default("usd"),
      dueDate: z.coerce.date(),
    })
    .refine((data) => data.billingPeriodEnd > data.billingPeriodStart, {
      message: "billingPeriodEnd must be after billingPeriodStart",
      path: ["billingPeriodEnd"],
    }),
});

export const updateBillSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    amountDue: z.number().int().positive().optional(),
    dueDate: z.coerce.date().optional(),
    // PAID is intentionally excluded here — only the Stripe
    // payment_intent.succeeded webhook is allowed to mark a Bill PAID.
    status: z.enum([BillStatus.OVERDUE, BillStatus.CANCELLED]).optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid("Invalid id") }),
});

export const listQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    userId: z.string().uuid().optional(),
    areaId: z.string().uuid().optional(),
    status: z.nativeEnum(BillStatus).optional(),
  }),
});