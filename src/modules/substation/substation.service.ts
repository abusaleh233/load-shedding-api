import { Prisma, SubstationStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../audit/audit.service";
import { invalidateCache } from "../../config/redis";

export async function createSubstation(actorId: string, data: {
  name: string;
  code: string;
  location: string;
  capacityMW: number;
  status?: SubstationStatus;
}) {
  const existing = await prisma.substation.findUnique({ where: { code: data.code } });
  if (existing) throw ApiError.conflict("A substation with this code already exists");

  const substation = await prisma.$transaction(async (tx) => {
    const created = await tx.substation.create({ data });
    await recordAudit(
      { userId: actorId, action: "SUBSTATION_CREATED", entity: "Substation", entityId: created.id },
      tx
    );
    return created;
  });

  await invalidateCache("outages:live*");
  return substation;
}

export async function listSubstations(params: {
  page: number;
  limit: number;
  status?: SubstationStatus;
  search?: string;
}) {
  const { page, limit, status, search } = params;
  const where: Prisma.SubstationWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, substations] = await prisma.$transaction([
    prisma.substation.count({ where }),
    prisma.substation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { areas: true } } },
    }),
  ]);

  return { substations, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getSubstationById(id: string) {
  const substation = await prisma.substation.findFirst({
    where: { id, deletedAt: null },
    include: { areas: { where: { deletedAt: null } } },
  });
  if (!substation) throw ApiError.notFound("Substation not found");
  return substation;
}

export async function updateSubstation(
  actorId: string,
  id: string,
  data: Partial<{ name: string; location: string; capacityMW: number; status: SubstationStatus }>
) {
  const existing = await prisma.substation.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiError.notFound("Substation not found");

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.substation.update({ where: { id }, data });
    await recordAudit(
      { userId: actorId, action: "SUBSTATION_UPDATED", entity: "Substation", entityId: id, metadata: data },
      tx
    );
    return result;
  });

  await invalidateCache("outages:live*");
  return updated;
}

export async function softDeleteSubstation(actorId: string, id: string) {
  const existing = await prisma.substation.findFirst({
    where: { id, deletedAt: null },
    include: { areas: { where: { deletedAt: null } } },
  });
  if (!existing) throw ApiError.notFound("Substation not found");
  if (existing.areas.length > 0) {
    throw ApiError.conflict(
      "Cannot delete a substation with active areas assigned. Reassign or delete its areas first."
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.substation.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordAudit(
      { userId: actorId, action: "SUBSTATION_DELETED", entity: "Substation", entityId: id },
      tx
    );
  });

  await invalidateCache("outages:live*");
}
