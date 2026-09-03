import { z } from "zod";

export const createCheckoutSessionSchema = z.object({
  body: z.object({
    billId: z.string().uuid("Invalid billId"),
  }),
});

export const listQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});
