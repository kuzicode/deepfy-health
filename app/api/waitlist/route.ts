import { isSelfHosted } from "@/server/edition";
import { getDb } from "@/db/client";
import { clientIp, createLimiter } from "@/server/login-lookup";
import { applyForAccess, WaitlistInput } from "@/server/waitlist";

const allow = createLimiter(5, 60_000);

export async function POST(req: Request) {
  if (isSelfHosted()) return new Response("not found", { status: 404 });
  const ip = clientIp(req);
  if (!allow(ip)) return Response.json({ error: "rate_limited" }, { status: 429 });
  const parsed = WaitlistInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_EMAIL" }, { status: 400 });
  return Response.json({ ok: true, next: await applyForAccess(getDb(), parsed.data) });
}
