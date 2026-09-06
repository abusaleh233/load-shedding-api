import { Prisma, ScheduleStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../audit/audit.service";
import { invalidateCache } from "../../config/redis";

export async function checkScheduleOverlap(
  client: Prisma.TransactionClient | typeof prisma,
  areaId: string,
  startTime: Date,
  endTime: Date,
  excludeScheduleId?: string
) {
  return client.schedule.findFirst({
    where: {
      areaId,
      deletedAt: null,
      status: { not: ScheduleStatus.CANCELLED },
      ...(excludeScheduleId ? { id: { not: excludeScheduleId } } : {}),
      // Standard interval-overlap predicate: two ranges [a,b) and [c,d)
      // intersect iff a < d AND c < b.
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });
}

/**
 * Race-condition-safe guard: acquires the per-area advisory lock, then
 * runs checkScheduleOverlap() and throws a 409 ApiError if it finds a
 * conflict. Must be called from within an open `prisma.$transaction`.
 */
async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  areaId: string,
  startTime: Date,
  endTime: Date,
  excludeScheduleId?: string
) {
  // Serialize concurrent writers for this area within the transaction.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${areaId}))`;

  const overlapping = await checkScheduleOverlap(tx, areaId, startTime, endTime, excludeScheduleId);

  if (overlapping) {
    throw ApiError.conflict(
      `Schedule conflicts with an existing schedule for this area (${overlapping.startTime.toISOString()} - ${overlapping.endTime.toISOString()})`
    );
  }
}

export async function createSchedule(
  actorId: string,
  data: { areaId: string; startTime: Date; endTime: Date; reason: string }
) {
  const area = await prisma.area.findFirst({ where: { id: data.areaId, deletedAt: null } });
  if (!area) throw ApiError.badRequest("Referenced area does not exist");

  const schedule = await prisma.$transaction(async (tx) => {
    await assertNoOverlap(tx, data.areaId, data.startTime, data.endTime);

    const created = await tx.schedule.create({
      data: {
        areaId: data.areaId,
        startTime: data.startTime,
        endTime: data.endTime,
        reason: data.reason,
        createdById: actorId,
        status: ScheduleStatus.PLANNED,
      },
    });

    await recordAudit(
      {
        userId: actorId,
        action: "SCHEDULE_CREATED",
        entity: "Schedule",
        entityId: created.id,
        metadata: { areaId: data.areaId, startTime: data.startTime, endTime: data.endTime },
      },
      tx
    );

    return created;
  });

  await invalidateCache("outages:live*");
  return schedule;
}

export async function listSchedules(params: {
  page: number;
  limit: number;
  areaId?: string;
  status?: ScheduleStatus;
  from?: string;
  to?: string;
}) {
  const { page, limit, areaId, status, from, to } = params;
  const where: Prisma.ScheduleWhereInput = {
    deletedAt: null,
    ...(areaId ? { areaId } : {}),
    ...(status ? { status } : {}),
    ...(from || to
      ? {
          startTime: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [total, schedules] = await prisma.$transaction([
    prisma.schedule.count({ where }),
    prisma.schedule.findMany({
      where,
      orderBy: { startTime: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        area: { select: { id: true, name: true, feederCode: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return { schedules, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getScheduleById(id: string) {
  const schedule = await prisma.schedule.findFirst({
    where: { id, deletedAt: null },
    include: { area: true, createdBy: { select: { id: true, name: true, email: true } } },
  });
  if (!schedule) throw ApiError.notFound("Schedule not found");
  return schedule;
}

export async function updateSchedule(
  actorId: string,
  id: string,
  data: Partial<{ startTime: Date; endTime: Date; reason: string; status: ScheduleStatus }>
) {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.schedule.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw ApiError.notFound("Schedule not found");

    const newStart = data.startTime ?? existing.startTime;
    const newEnd = data.endTime ?? existing.endTime;

    if (data.startTime || data.endTime) {
      await assertNoOverlap(tx, existing.areaId, newStart, newEnd, id);
    }

    const result = await tx.schedule.update({ where: { id }, data });

    await recordAudit(
      { userId: actorId, action: "SCHEDULE_UPDATED", entity: "Schedule", entityId: id, metadata: data },
      tx
    );

    return result;
  });

  await invalidateCache("outages:live*");
  return updated;
}

export async function softDeleteSchedule(actorId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.schedule.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw ApiError.notFound("Schedule not found");

    await tx.schedule.update({ where: { id }, data: { deletedAt: new Date(), status: ScheduleStatus.CANCELLED } });
    await recordAudit({ userId: actorId, action: "SCHEDULE_DELETED", entity: "Schedule", entityId: id }, tx);
  });

  await invalidateCache("outages:live*");
}
