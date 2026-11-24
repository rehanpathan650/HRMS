import "server-only";
import type { NotificationType, Prisma, PrismaClient } from "@prisma/client";
import { db } from "../lib/db";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}

export async function notify(userId: string, n: NotifyInput, tx: Tx = db) {
  await tx.notification.create({ data: { userId, ...n } });
}

export async function notifyAdmins(n: NotifyInput, tx: Tx = db) {
  const admins = await tx.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
  if (admins.length) await tx.notification.createMany({ data: admins.map((a) => ({ userId: a.id, ...n })) });
}

export async function broadcast(n: NotifyInput, tx: Tx = db) {
  const users = await tx.user.findMany({ where: { isActive: true }, select: { id: true } });
  if (users.length) await tx.notification.createMany({ data: users.map((u) => ({ userId: u.id, ...n })) });
  return users.length;
}
