import { isSelfHosted } from "@/server/edition";
import { getDb } from "@/db/client";
import { deleteStaleUnverified } from "@/server/access";
import { gcOrphanAttachments } from "@/server/attachments";
import { cronAuthorized } from "@/server/cron-auth";
import { masterKey } from "@/server/crypto";
import { appBase, sendReminderEmail } from "@/server/mail";
import { pauseParams, runReminderJob } from "@/server/reminders";

// 每日任务（由定时任务调用）：提醒邮件 + 清理未验证账号 + 清理过期的附件旧文件

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (isSelfHosted()) return new Response("not found", { status: 404 });
  if (!cronAuthorized(req)) return new Response("not found", { status: 404 });
  const kek = masterKey();
  const result = await runReminderJob(getDb(), kek, (m) =>
    sendReminderEmail(m.to, m.items, `${appBase()}/api/reminders/pause?${pauseParams(kek, m.userId)}`, m.locale));
  // 附件旧文件的清理不能只靠上传触发：磁盘满时上传不成功，就永远等不到清理
  const orphansRemoved = (await gcOrphanAttachments(getDb())).length;
  return Response.json({ ...result, staleUnverifiedDeleted: await deleteStaleUnverified(getDb()), orphansRemoved });
}
