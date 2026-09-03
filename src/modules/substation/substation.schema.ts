import { z } from "zod";
import { SubstationStatus } from "@prisma/client";

export const createSubstationSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(150),
    code: z.string().trim().min(2).max(30),
    location: z.string().trim().min(2).max(255),
    capacityMW: z.number().positive("capacityMW must be a positive number"),
    status: z.nativeEnum(SubstationStatus).optional(),
  }),
});

export const updateSubstationSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().trim().min(2).max(150).optional(),
    location: z.string().trim().min(2).max(255).optional(),
    capacityMW: z.number().positive().optional(),
    status: z.nativeEnum(SubstationStatus).optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid("Invalid id") }),
});

export const listQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.nativeEnum(SubstationStatus).optional(),
    search: z.string().optional(),
  }),
});
