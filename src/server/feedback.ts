import { and, asc, count, desc, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import { catalogFeedback, feedback, user } from "@/db/schema";
import { randomId } from "./crypto";
import { DISK_ALERT_PCT, MAIL_DAILY_ALERT, MAIL_MONTHLY_ALERT, getState, resourceStats, setState } from "./ops";

// 意见反馈：用户在「意见反馈」页提交；每周把新反馈、字典缺口变化和几项运营数字汇成一封邮件发给管理员。
// 反馈正文是用户自己写给我们的，附登录邮箱以便回复；页面上提示不要填检查数值等隐私。

const FEEDBACK_KINDS = ["idea", "bug", "other"] as const;
const DIGEST_EVERY_DAYS = 7;
const MAX_IN_MAIL = 100;

export const FeedbackForm = z.object({
  kind: z.enum(FEEDBACK_KINDS).default("idea"),
  body: z.string().trim().min(2).max(2000),
  // 只留站内路径，丢掉查询参数与外部地址
  page: z.preprocess((v) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v.split(/[?#]/)[0].slice(0, 200) : undefined), z.string().optional()),
});

export async function addFeedback(db: DB, u: { id: string; email: string }, f: z.infer<typeof FeedbackForm>) {
  await db.insert(feedback).values({ id: randomId(), userId: u.id, email: u.email, kind: f.kind, body: f.body, page: f.page ?? null });
}

export const listRecentFeedback = (db: DB, limit = 50) => db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(limit);

// ---- 每周汇总 ----

type GapSnapshot = Record<string, number>;
interface GapChange { name: string; unit: string | null; section: string | null; count: number; added: number; isNew: boolean }
export interface Digest {
  since: Date | null;
  feedback: (typeof feedback.$inferSelect)[];
  gaps: GapChange[];
  stats: { users: number; newUsers: number };
  resources: Awaited<ReturnType<typeof resourceStats>> & { alert: boolean };
}

/** 字典缺口只存聚合计数、时间精确到月：和上次汇总时的计数快照比，得出新增 / 次数增加的项目 */
function gapChanges(rows: (typeof catalogFeedback.$inferSelect)[], prev: GapSnapshot): GapChange[] {
  return rows
    .map((g) => ({ name: g.name, unit: g.unit, section: g.section, count: g.count, added: g.count - (prev[g.nameNorm] ?? 0), isNew: !(g.nameNorm in prev) }))
    .filter((g) => g.added > 0)
    .sort((a, b) => b.added - a.added || b.count - a.count);
}

/** 汇总内容（不发信、不改状态），也供测试用 */
async function buildDigest(db: DB, now = new Date()): Promise<{ digest: Digest; snapshot: GapSnapshot }> {
  const last = await getState<{ at: string }>(db, "digest");
  const since = last ? new Date(last.value.at) : null;
  const pending = await db.select().from(feedback).where(isNull(feedback.digestedAt)).orderBy(asc(feedback.createdAt)).limit(MAX_IN_MAIL);
  const gapRows = await db.select().from(catalogFeedback);
  const prev = (await getState<GapSnapshot>(db, "digest-gaps"))?.value ?? {};
  const weekAgo = new Date(now.getTime() - DIGEST_EVERY_DAYS * 86_400_000);
  const [{ users }] = await db.select({ users: count() }).from(user);
  const [{ newUsers }] = await db.select({ newUsers: count() }).from(user).where(gt(user.createdAt, since ?? weekAgo));
  const res = await resourceStats(db);
  const alert = (res.diskUsedPct ?? 0) >= DISK_ALERT_PCT || res.mailPeakDay >= MAIL_DAILY_ALERT || res.mailMonth >= MAIL_MONTHLY_ALERT;
  return {
    digest: { since, feedback: pending, gaps: gapChanges(gapRows, prev), stats: { users, newUsers }, resources: { ...res, alert } },
    snapshot: Object.fromEntries(gapRows.map((g) => [g.nameNorm, g.count])),
  };
}

/**
 * 每天由 cron 调用；距上次汇总不足 7 天直接返回。没有新反馈、新的字典缺口、也没有资源告警时不发信，但同样记下时间（保持每周节奏）。
 * 发信失败不改状态，第二天重试。
 */
export async function runDigest(db: DB, send: (d: Digest) => Promise<void>, now = new Date()) {
  const last = await getState<{ at: string }>(db, "digest");
  if (last && now.getTime() - new Date(last.value.at).getTime() < (DIGEST_EVERY_DAYS - 0.5) * 86_400_000) return { sent: false, reason: "not-due" };
  const { digest, snapshot } = await buildDigest(db, now);
  const hasNews = digest.feedback.length > 0 || digest.gaps.length > 0 || digest.resources.alert;
  if (hasNews) await send(digest);
  await db.transaction(async (tx) => {
    const ids = digest.feedback.map((f) => f.id);
    if (ids.length) await tx.update(feedback).set({ digestedAt: now }).where(and(inArray(feedback.id, ids), isNull(feedback.digestedAt)));
    await setState(tx as unknown as DB, "digest", { at: now.toISOString() });
    await setState(tx as unknown as DB, "digest-gaps", snapshot);
  });
  return { sent: hasNews, feedback: digest.feedback.length, gaps: digest.gaps.length };
}
