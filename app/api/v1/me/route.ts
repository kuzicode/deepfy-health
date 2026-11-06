import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { user } from "@/db/schema";
import { json, withRepo } from "@/server/api";

export const GET = (req: Request) =>
  withRepo(req, async (_repo, userId) => {
    const u = await getDb().query.user.findFirst({ where: eq(user.id, userId) });
    return json({ id: userId, email: u?.email, name: u?.name });
  });
