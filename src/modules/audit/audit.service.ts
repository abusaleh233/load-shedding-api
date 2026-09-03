import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";

type PrismaTx = Prisma.TransactionClient | PrismaClient;

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Writes an audit trail entry. Accepts an optional transaction client so
 * it can participate in the same atomic transaction as the action it logs
 * (e.g. a schedule creation + its audit row commit or roll back together).
 */
export async function recordAudit(entry: AuditEntry, tx: PrismaTx = prisma): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      metadata: (entry.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}

export async function listAuditLogs(params: {
  page: number;
  limit: number;
  entity?: string;
  action?: string;
  userId?: string;
}) {
  const { page, limit, entity, action, userId } = params;
  const where: Prisma.AuditLogWhereInput = {
    ...(entity ? { entity } : {}),
    ...(action ? { action } : {}),
    ...(userId ? { userId } : {}),
  };

  const [total, logs] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    }),
  ]);

  return {
    logs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
