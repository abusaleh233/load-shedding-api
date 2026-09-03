import { z } from "zod";
import { OutageType, OutageLogStatus, PriorityLevel } from "@prisma/client";

export const createOutageSchema = z.object({
  body: z.object({
    areaId: z.string().uuid("Invalid areaId"),
    type: z.nativeEnum(OutageType),
    priority: z.nativeEnum(PriorityLevel).optional(),
    description: z.string().trim().max(1000).optional(),
    startTime: z.coerce.date().optional(),
  }),
});

export const updateOutageSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.nativeEnum(OutageLogStatus).optional(),
    priority: z.nativeEnum(PriorityLevel).optional(),
    description: z.string().trim().max(1000).optional(),
    endTime: z.coerce.date().optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid("Invalid id") }),
});

export const listQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    areaId: z.string().uuid().optional(),
    type: z.nativeEnum(OutageType).optional(),
    status: z.nativeEnum(OutageLogStatus).optional(),
  }),
});
