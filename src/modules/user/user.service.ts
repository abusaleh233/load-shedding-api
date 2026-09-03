import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../audit/audit.service";

const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  provider: true,
  isVerified: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export async function getUserById(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: SAFE_SELECT,
  });
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function updateOwnProfile(userId: string, data: { name?: string; phone?: string }) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: SAFE_SELECT,
  });
  return user;
}

export async function listUsers(params: {
  page: number;
  limit: number;
  role?: Role;
  search?: string;
}) {
  const { page, limit, role, search } = params;
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(role ? { role } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: SAFE_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function updateUserRole(actorId: string, targetId: string, role: Role) {
  const target = await prisma.user.findFirst({ where: { id: targetId, deletedAt: null } });
  if (!target) throw ApiError.notFound("User not found");

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id: targetId },
      data: { role },
      select: SAFE_SELECT,
    });
    await recordAudit(
      {
        userId: actorId,
        action: "USER_ROLE_UPDATED",
        entity: "User",
        entityId: targetId,
        metadata: { previousRole: target.role, newRole: role },
      },
      tx
    );
    return result;
  });

  return updated;
}

/** Soft delete: sets deletedAt instead of physically removing the row. */
export async function softDeleteUser(actorId: string, targetId: string) {
  const target = await prisma.user.findFirst({ where: { id: targetId, deletedAt: null } });
  if (!target) throw ApiError.notFound("User not found");
  if (target.id === actorId) throw ApiError.badRequest("You cannot delete your own account");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetId },
      data: { deletedAt: new Date(), isActive: false },
    });
    await tx.refreshToken.updateMany({ where: { userId: targetId }, data: { revoked: true } });
    await recordAudit(
      { userId: actorId, action: "USER_DELETED", entity: "User", entityId: targetId },
      tx
    );
  });
}
