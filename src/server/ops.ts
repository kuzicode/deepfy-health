import fs from "node:fs/promises";
import { gte, sql, sum } from "drizzle-orm";
import { type DB, getDb } from "@/db/client";
import { attachment, opsState } from "@/db/schema";
import { attachmentDir } from "./attachments";
import { todayCN } from "./cn-time";

// 运维小状态（ops_state 键值表）与资源监控：每日发信计数、磁盘与附件占用。只在每周汇总里报给管理员。

export async function getState<T>(db: DB, key: string): Promise<{ value: T; updatedAt: Date } | undefined> {
  const [row] = await db.select().from(opsState).where(sql`${opsState.key} = ${key}`);
  return row && { value: row.value as T, updatedAt: row.updatedAt };
}

export const setState = (db: DB, key: string, value: unknown) =>
  db.insert(opsState).values({ key, value }).onConflictDoUpdate({ target: opsState.key, set: { value, updatedAt: new Date() } });

/** 每发成功一封邮件，当天（北京时间）计数 +1；键 mail:YYYY-MM-DD，值是数字 */
export async function countMail(db: DB = getDb(), day = todayCN()) {
  await db.insert(opsState).values({ key: `mail:${day}`, value: 1 })
    .onConflictDoUpdate({ target: opsState.key, set: { value: sql`to_jsonb((${opsState.value})::int + 1)`, updatedAt: new Date() } });
}

/** 资源快照：近 7 天发信量与单日最高、本月发信量、附件总量、附件所在磁盘的使用率 */
export async function resourceStats(db: DB, today = todayCN()) {
  const from = new Date(Date.parse(today) - 6 * 86_400_000).toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;
  const since = from < monthStart ? from : monthStart;
  const rows = (await db.select({ key: opsState.key, value: opsState.value }).from(opsState).where(gte(opsState.key, `mail:${since}`)))
    .filter((d) => d.key.startsWith("mail:") && d.key <= `mail:${today}`);
  const counts = rows.filter((d) => d.key >= `mail:${from}`).map((d) => Number(d.value));
  const mailMonth = rows.filter((d) => d.key >= `mail:${monthStart}`).reduce((a, d) => a + Number(d.value), 0);
  const [{ bytes }] = await db.select({ bytes: sum(attachment.size) }).from(attachment);
  const disk = await fs.statfs(/*turbopackIgnore: true*/ attachmentDir()).catch(() => undefined);
  return {
    mailWeek: counts.reduce((a, b) => a + b, 0),
    mailPeakDay: Math.max(0, ...counts),
    mailMonth,
    attachmentBytes: Number(bytes ?? 0),
    diskUsedPct: disk ? Math.round((1 - disk.bavail / disk.blocks) * 100) : undefined,
  };
}

/** 需要管理员注意：磁盘用到 70%，或发信接近 Resend 免费档上限（每天 100 封、每月 3,000 封）的 80% */
export const DISK_ALERT_PCT = 70;
export const MAIL_DAILY_ALERT = 80;
export const MAIL_MONTHLY_ALERT = 2400;
