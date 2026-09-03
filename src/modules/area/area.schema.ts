import { z } from "zod";

export const createAreaSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(150),
    feederCode: z.string().trim().min(2).max(30),
    substationId: z.string().uuid("Invalid substationId"),
  }),
});

export const updateAreaSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().trim().min(2).max(150).optional(),
    substationId: z.string().uuid().optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid("Invalid id") }),
});

export const listQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    substationId: z.string().uuid().optional(),
    search: z.string().optional(),
  }),
});
