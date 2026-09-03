import { z } from "zod";
import { Role } from "@prisma/client";

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().min(6).max(20).optional(),
  }),
});

export const listUsersQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    role: z.nativeEnum(Role).optional(),
    search: z.string().optional(),
  }),
});

export const updateUserRoleSchema = z.object({
  body: z.object({
    role: z.nativeEnum(Role),
  }),
  params: z.object({
    id: z.string().uuid("Invalid user id"),
  }),
});

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid id"),
  }),
});
