import { getDb } from "@/db/client";
import { cronAuthorized } from "@/server/cron-auth";
import { masterKey } from "@/server/crypto";
import { appBase, sendReminderEmail } from "@/server/mail";
import { pauseParams, runReminderJob } from "@/server/reminders";

// 每日提醒任务（由定时任务调用）

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!cronAuthorized(req)) return new Response("not found", { status: 404 });
  const kek = masterKey();
  const result = await runReminderJob(getDb(), kek, (m) =>
    sendReminderEmail(m.to, m.items, `${appBase()}/api/reminders/pause?${pauseParams(kek, m.userId)}`, m.locale));
  return Response.json(result);
}
