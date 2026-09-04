import { Prisma, BillStatus, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../audit/audit.service";

export async function createBill(
  actorId: string,
  data: {
    userId: string;
    areaId: string;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
    unitsConsumedKWh: number;
    amountDue: number;
    currency: string;
    dueDate: Date;
  }
) {
  const user = await prisma.user.findFirst({ where: { id: data.userId, deletedAt: null } });
  if (!user) throw ApiError.badRequest("Referenced user does not exist");

  const area = await prisma.area.findFirst({ where: { id: data.areaId, deletedAt: null } });
  if (!area) throw ApiError.badRequest("Referenced area does not exist");

  const bill = await prisma.$transaction(async (tx) => {
    const created = await tx.bill.create({
      data: { ...data, status: BillStatus.UNPAID },
    });
    await recordAudit(
      {
        userId: actorId,
        action: "BILL_CREATED",
        entity: "Bill",
        entityId: created.id,
        metadata: { billedUserId: data.userId, amountDue: data.amountDue },
      },
      tx
    );
    return created;
  });

  return bill;
}

export async function listBills(
  requester: { id: string; role: Role },
  params: { page: number; limit: number; userId?: string; areaId?: string; status?: BillStatus }
) {
  const { page, limit, userId, areaId, status } = params;

  // CONSUMER can only ever see their own bills — override any userId filter.
  const effectiveUserId = requester.role === Role.CONSUMER ? requester.id : userId;

  const where: Prisma.BillWhereInput = {
    deletedAt: null,
    ...(effectiveUserId ? { userId: effectiveUserId } : {}),
    ...(areaId ? { areaId } : {}),
    ...(status ? { status } : {}),
  };

  const [total, bills] = await prisma.$transaction([
    prisma.bill.count({ where }),
    prisma.bill.findMany({
      where,
      orderBy: { dueDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        area: { select: { id: true, name: true, feederCode: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return { bills, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getBillById(requester: { id: string; role: Role }, id: string) {
  const bill = await prisma.bill.findFirst({
    where: { id, deletedAt: null },
    include: {
      area: true,
      user: { select: { id: true, name: true, email: true } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!bill) throw ApiError.notFound("Bill not found");

  if (requester.role === Role.CONSUMER && bill.userId !== requester.id) {
    throw ApiError.forbidden("You are not permitted to view this bill");
  }

  return bill;
}

export async function updateBill(
  actorId: string,
  id: string,
  data: Partial<{ amountDue: number; dueDate: Date; status: BillStatus }>
) {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.bill.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw ApiError.notFound("Bill not found");
    if (existing.status === BillStatus.PAID) {
      throw ApiError.conflict("A paid bill cannot be modified");
    }

    const result = await tx.bill.update({ where: { id }, data });
    await recordAudit(
      { userId: actorId, action: "BILL_UPDATED", entity: "Bill", entityId: id, metadata: data },
      tx
    );
    return result;
  });

  return updated;
}

export async function softDeleteBill(actorId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.bill.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw ApiError.notFound("Bill not found");

    await tx.bill.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordAudit({ userId: actorId, action: "BILL_DELETED", entity: "Bill", entityId: id }, tx);
  });
}