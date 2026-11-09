import { isSelfHosted } from "@/server/edition";
import { getDb } from "@/db/client";
import { adminEmails } from "@/server/access";
import { cronAuthorized } from "@/server/cron-auth";
import { runDigest } from "@/server/feedback";
import { sendDigestEmail } from "@/server/mail";

// 每周汇总（由定时任务每天调用，距上次满 7 天才发）：用户反馈 + 字典缺口变化，发给 KZ_ADMIN_EMAILS

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (isSelfHosted()) return new Response("not found", { status: 404 });
  if (!cronAuthorized(req)) return new Response("not found", { status: 404 });
  const to = adminEmails();
  if (!to.length) return Response.json({ sent: false, reason: "no-admin" });
  return Response.json(await runDigest(getDb(), (d) => sendDigestEmail(to, d)));
}
