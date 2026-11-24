import { route } from "@/server/lib/api";
import { audit } from "@/server/lib/audit";
import { runRetention } from "@/server/services/retention";

export const POST = route({ auth: "ADMIN", rateLimit: { limit: 3 } }, async ({ user }) => {
  const result = await runRetention();
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "retention.run",
    entityType: "System",
    metadata: result,
  });
  return result;
});
