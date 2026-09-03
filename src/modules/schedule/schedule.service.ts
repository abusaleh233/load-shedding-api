import { Prisma, ScheduleStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../audit/audit.service";
import { invalidateCache } from "../../config/redis";

/**
 * -------------------------------------------------------------------------
 * OVERLAP PREVENTION / RACE-CONDITION STRATEGY
 * -------------------------------------------------------------------------
 * Two concurrent requests scheduling the same Area could both pass a naive
 * "check then insert" overlap check under READ COMMITTED isolation (the
 * Postgres default) because neither transaction sees the other's uncommitted
 * row. We close that gap with a two-layer defense:
 *
 *   1. checkScheduleOverlap() — the actual overlap TEST: a plain Prisma
 *      query using the standard interval-overlap predicate
 *      (existing.start < new.end) AND (existing.end > new.start), against
 *      every non-cancelled, non-deleted Schedule for the same Area.
 *   2. assertNoOverlap() — wraps that test with a Postgres transaction-scoped
 *      ADVISORY LOCK keyed on the areaId (pg_advisory_xact_lock(hashtext(areaId))).
 *      This serializes all schedule writes for the same area — a second
 *      concurrent transaction blocks until the first commits or rolls back —
 *      so by the time checkScheduleOverlap() runs, it always sees a
 *      consistent, up-to-date picture instead of a stale snapshot.
 *
 * Without the lock, checkScheduleOverlap() alone is still correct for
 * sequential calls but is vulnerable to the classic TOCTOU race under
 * concurrent load; without the query, the lock alone serializes writes but
 * never actually detects a conflict. Both pieces are required together.
 *
 * For defense-in-depth in production, this should be paired with a native
 * Postgres EXCLUDE constraint (via the btree_gist extension) on
 * (area_id WITH =, tsrange(start_time, end_time) WITH &&) added through a
 * raw SQL migration — Prisma's schema DSL can't express EXCLUDE constraints
 * directly, so it's documented here rather than silently omitted.
 * -------------------------------------------------------------------------
 */

/**
 * Pure overlap test: does any existing, non-cancelled, non-deleted Schedule
 * for `areaId` intersect [startTime, endTime)? Returns the conflicting
 * Schedule (or null). Takes a Prisma client/transaction client so it can be
 * called either standalone (e.g. for a "preview" endpoint or a unit test
 * against a test database) or from inside assertNoOverlap()'s transaction.
 */
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
