import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../audit/audit.service";
import { invalidateCache } from "../../config/redis";

export async function createArea(actorId: string, data: { name: string; feederCode: string; substationId: string }) {
  const substation = await prisma.substation.findFirst({
    where: { id: data.substationId, deletedAt: null },
  });
  if (!substation) throw ApiError.badRequest("Referenced substation does not exist");

  const existingCode = await prisma.area.findUnique({ where: { feederCode: data.feederCode } });
  if (existingCode) throw ApiError.conflict("An area with this feederCode already exists");

  const area = await prisma.$transaction(async (tx) => {
    const created = await tx.area.create({ data });
    await recordAudit({ userId: actorId, action: "AREA_CREATED", entity: "Area", entityId: created.id }, tx);
    return created;
  });

  await invalidateCache("outages:live*");
  return area;
}

export async function listAreas(params: { page: number; limit: number; substationId?: string; search?: string }) {
  const { page, limit, substationId, search } = params;
  const where: Prisma.AreaWhereInput = {
    deletedAt: null,
    ...(substationId ? { substationId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { feederCode: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, areas] = await prisma.$transaction([
    prisma.area.count({ where }),
    prisma.area.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { substation: { select: { id: true, name: true, code: true } } },
    }),
  ]);

  return { areas, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getAreaById(id: string) {
  const area = await prisma.area.findFirst({
    where: { id, deletedAt: null },
    include: { substation: true },
  });
  if (!area) throw ApiError.notFound("Area not found");
  return area;
}

export async function updateArea(actorId: string, id: string, data: Partial<{ name: string; substationId: string }>) {
  const existing = await prisma.area.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiError.notFound("Area not found");

  if (data.substationId) {
    const substation = await prisma.substation.findFirst({ where: { id: data.substationId, deletedAt: null } });
    if (!substation) throw ApiError.badRequest("Referenced substation does not exist");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.area.update({ where: { id }, data });
    await recordAudit({ userId: actorId, action: "AREA_UPDATED", entity: "Area", entityId: id, metadata: data }, tx);
    return result;
  });

  await invalidateCache("outages:live*");
  return updated;
}

export async function softDeleteArea(actorId: string, id: string) {
  const existing = await prisma.area.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiError.notFound("Area not found");

  await prisma.$transaction(async (tx) => {
    await tx.area.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordAudit({ userId: actorId, action: "AREA_DELETED", entity: "Area", entityId: id }, tx);
  });

  await invalidateCache("outages:live*");
}
