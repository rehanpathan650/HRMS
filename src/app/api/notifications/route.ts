import { z } from "zod";
import { route } from "@/server/lib/api";
import { db } from "@/server/lib/db";
import { id } from "@/lib/validators/common";

export const GET = route({ auth: "ANY", rateLimit: { limit: 240 } }, async ({ user }) => {
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return {
    unread,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  };
});

const body = z.object({ ids: z.array(id).max(100).optional(), all: z.boolean().optional() });

export const POST = route({ auth: "ANY", body }, async ({ user, body }) => {
  const res = await db.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(body.all ? {} : { id: { in: body.ids ?? [] } }) },
    data: { readAt: new Date() },
  });
  return { updated: res.count };
});
