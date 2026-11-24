import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { route } from "@/server/lib/api";
import { pagination, ymd } from "@/lib/validators/common";
import { db } from "@/server/lib/db";
import { addDays, dateOnly } from "@/server/lib/time";

const query = pagination.extend({
  search: z.string().trim().max(100).optional(),
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(40).optional(),
  from: ymd.optional(),
  to: ymd.optional(),
});

export const GET = route({ auth: "ADMIN", query }, async ({ query: q }) => {
  const where: Prisma.AuditLogWhereInput = {
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.search
      ? {
          OR: [
            { actorEmail: { contains: q.search, mode: "insensitive" } },
            { action: { contains: q.search, mode: "insensitive" } },
            { entityId: { contains: q.search } },
          ],
        }
      : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: dateOnly(q.from) } : {}),
            ...(q.to ? { lt: dateOnly(addDays(q.to, 1)) } : {}),
          },
        }
      : {}),
  };
  const [total, rows, actions] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      actorEmail: r.actorEmail,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      metadata: r.metadata,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
    actions: actions.map((a) => a.action),
  };
});
