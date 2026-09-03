import { z } from "zod";
import { ScheduleStatus } from "@prisma/client";

const isoDate = z.coerce.date();

export const createScheduleSchema = z.object({
  body: z
    .object({
      areaId: z.string().uuid("Invalid areaId"),
      startTime: isoDate,
      endTime: isoDate,
      reason: z.string().trim().min(3).max(500),
    })
    .refine((data) => data.endTime > data.startTime, {
      message: "endTime must be after startTime",
      path: ["endTime"],
    })
    .refine((data) => data.startTime > new Date(Date.now() - 5 * 60 * 1000), {
      message: "startTime cannot be in the past",
      path: ["startTime"],
    }),
});

export const updateScheduleSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      startTime: isoDate.optional(),
      endTime: isoDate.optional(),
      reason: z.string().trim().min(3).max(500).optional(),
      status: z.nativeEnum(ScheduleStatus).optional(),
    })
    .refine((data) => !(data.startTime && data.endTime) || data.endTime > data.startTime, {
      message: "endTime must be after startTime",
      path: ["endTime"],
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
    status: z.nativeEnum(ScheduleStatus).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
});
