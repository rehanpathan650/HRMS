import { route } from "@/server/lib/api";
import { announcementSchema } from "@/lib/validators/org";
import { audit } from "@/server/lib/audit";
import { broadcast } from "@/server/services/notifications";

export const POST = route(
  { auth: "ADMIN", body: announcementSchema, rateLimit: { limit: 5 } },
  async ({ user, body }) => {
    const recipients = await broadcast({ type: "ANNOUNCEMENT", title: body.title, body: body.body });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: "announcement.send",
      entityType: "Notification",
      metadata: { title: body.title, recipients },
    });
    return { recipients };
  },
);
