import { isSelfHosted } from "@/server/edition";
import { z } from "zod";
import { getDb } from "@/db/client";
import { clientIp, createLimiter, lookupEmail } from "@/server/login-lookup";

const Body = z.object({ email: z.email().max(254) });
const allow = createLimiter(10, 60_000);

export async function POST(req: Request) {
  if (isSelfHosted()) return new Response("not found", { status: 404 });
  const ip = clientIp(req);
  if (!allow(ip)) return Response.json({ error: "rate_limited" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_EMAIL" }, { status: 400 });
  return Response.json({ next: await lookupEmail(getDb(), parsed.data.email) });
}
