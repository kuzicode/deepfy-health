import { getDb } from "@/db/client";
import { deleteStaleUnverified } from "@/server/access";
import { cronAuthorized } from "@/server/cron-auth";
import { masterKey } from "@/server/crypto";
import { appBase, sendReminderEmail } from "@/server/mail";
import { pauseParams, runReminderJob } from "@/server/reminders";

// 每日任务（由定时任务调用）：提醒邮件 + 清理未验证账号

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!cronAuthorized(req)) return new Response("not found", { status: 404 });
  const kek = masterKey();
  const result = await runReminderJob(getDb(), kek, (m) =>
    sendReminderEmail(m.to, m.items, `${appBase()}/api/reminders/pause?${pauseParams(kek, m.userId)}`, m.locale));
  // 每天顺带清理长期未验证的账号（开放注册后会有人填了邮箱就走）
  return Response.json({ ...result, staleUnverifiedDeleted: await deleteStaleUnverified(getDb()) });
}
