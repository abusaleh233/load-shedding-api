import { Prisma, OutageType, OutageLogStatus, PriorityLevel, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../audit/audit.service";
import { cacheAside, invalidateCache } from "../../config/redis";
import { env } from "../../config/env";

export async function createOutage(
  actorId: string,
  actorRole: Role,
  data: { areaId: string; type: OutageType; priority?: PriorityLevel; description?: string; startTime?: Date }
) {
  const area = await prisma.area.findFirst({ where: { id: data.areaId, deletedAt: null } });
  if (!area) throw ApiError.badRequest("Referenced area does not exist");

  
  if (data.type === OutageType.SCHEDULED && actorRole === Role.CONSUMER) {
    throw ApiError.forbidden("Only operators or admins can log scheduled outages");
  }

  const outage = await prisma.$transaction(async (tx) => {
    const created = await tx.outageLog.create({
      data: {
        areaId: data.areaId,
        type: data.type,
        priority: data.priority ?? PriorityLevel.MEDIUM,
        description: data.description,
        startTime: data.startTime ?? new Date(),
        status: OutageLogStatus.REPORTED,
        reportedById: actorId,
      },
    });

    await recordAudit(
      {
        userId: actorId,
        action: data.type === OutageType.EMERGENCY ? "EMERGENCY_OUTAGE_REPORTED" : "SCHEDULED_OUTAGE_LOGGED",
        entity: "OutageLog",
        entityId: created.id,
        metadata: { areaId: data.areaId, priority: created.priority },
      },
      tx
    );

    return created;
  });

  await invalidateCache("outages:live*");
  return outage;
}


export async function getLiveOutages() {
  return cacheAside("outages:live", env.REDIS_TTL_SECONDS, async () => {
    return prisma.outageLog.findMany({
      where: {
        deletedAt: null,
        status: { in: [OutageLogStatus.REPORTED, OutageLogStatus.IN_PROGRESS] },
      },
      orderBy: [{ priority: "desc" }, { startTime: "desc" }],
      include: {
        area: {
          select: { id: true, name: true, feederCode: true, substation: { select: { id: true, name: true } } },
        },
        reportedBy: { select: { id: true, name: true, role: true } },
      },
    });
  });
}

export async function listOutages(params: {
  page: number;
  limit: number;
  areaId?: string;
  type?: OutageType;
  status?: OutageLogStatus;
}) {
  const { page, limit, areaId, type, status } = params;
  const where: Prisma.OutageLogWhereInput = {
    deletedAt: null,
    ...(areaId ? { areaId } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  };

  const [total, outages] = await prisma.$transaction([
    prisma.outageLog.count({ where }),
    prisma.outageLog.findMany({
      where,
      orderBy: { startTime: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { area: { select: { id: true, name: true, feederCode: true } } },
    }),
  ]);

  return { outages, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getOutageById(id: string) {
  const outage = await prisma.outageLog.findFirst({
    where: { id, deletedAt: null },
    include: { area: true, reportedBy: { select: { id: true, name: true, email: true, role: true } } },
  });
  if (!outage) throw ApiError.notFound("Outage not found");
  return outage;
}

export async function updateOutage(
  actorId: string,
  id: string,
  data: Partial<{ status: OutageLogStatus; priority: PriorityLevel; description: string; endTime: Date }>
) {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.outageLog.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw ApiError.notFound("Outage not found");

    const result = await tx.outageLog.update({
      where: { id },
      data: {
        ...data,
        ...(data.status === OutageLogStatus.RESOLVED && !data.endTime ? { endTime: new Date() } : {}),
      },
    });

    await recordAudit(
      { userId: actorId, action: "OUTAGE_UPDATED", entity: "OutageLog", entityId: id, metadata: data },
      tx
    );

    return result;
  });

  await invalidateCache("outages:live*");
  return updated;
}

export async function softDeleteOutage(actorId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.outageLog.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw ApiError.notFound("Outage not found");

    await tx.outageLog.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordAudit({ userId: actorId, action: "OUTAGE_DELETED", entity: "OutageLog", entityId: id }, tx);
  });

  await invalidateCache("outages:live*");
}
