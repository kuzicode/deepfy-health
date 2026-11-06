import crypto from "node:crypto";
import { and, eq, exists, isNull, or } from "drizzle-orm";
import { addDays, schedule, type ScheduleItem } from "@/core/analysis";
import type { Catalog, MemberBundle } from "@/core/schema";
import type { DB } from "@/db/client";
import { member, reminderSetting, user, userStatus } from "@/db/schema";
import { toLocale, type Locale } from "@/i18n/config";
import { todayCN } from "./cn-time";
import { sha256 } from "./crypto";
import { PgRepository } from "./pg-repository";

// 提醒邮件：默认开启（没有设置行 = 启用）。设置只存开关 / 收件邮箱 / 提前天数 / 上次检查日期，不存健康内容。
// 每日任务解密档案、跑 schedule()（与网页「接下来」同一来源），把落在窗口里的待办汇成一封邮件。

export const LEAD_CHOICES = [30, 14, 7, 3, 1, 0] as const;
export const DEFAULT_LEAD = [7, 0];
/** 漏跑多天时最多往回补 7 天，避免一次发出很久以前的提醒 */
const MAX_CATCHUP_DAYS = 7;
const CODE_TTL_MS = 5 * 60 * 1000; // 与验证码邮件模板里写的「5 分钟」一致
const MAX_TRIES = 5;


export interface DueItem { memberId: string; memberName: string; item: ScheduleItem; lead: number }

/**
 * 选出「到期日 − 提前天数」落在 (from, to] 的待办；同一项命中多个提前天数（漏跑补发）只算一次，取最近的那个。
 * 没有体检记录、也没手动定日期时「建议安排体检」的到期日永远是今天，不发，否则每天都会重复；手动定了日期的照常提醒。
 */
export function dueItems(members: { id: string; name: string; items: ScheduleItem[] }[], leadDays: number[], from: string, to: string): DueItem[] {
  const leads = [...new Set(leadDays)].sort((a, b) => a - b);
  const out: DueItem[] = [];
  for (const m of members) {
    for (const item of m.items) {
      if (item.kind === "annual-checkup" && !item.params.last && !item.params.scheduled) continue; // 还没安排的首次体检
      const lead = leads.find((l) => { const d = addDays(item.due, -l); return d > from && d <= to; });
      if (lead !== undefined) out.push({ memberId: m.id, memberName: m.name, item, lead });
    }
  }
  return out.sort((a, b) => a.item.due.localeCompare(b.item.due) || a.memberName.localeCompare(b.memberName));
}

/** 检查窗口的起点（不含）：首次 = 昨天；漏跑最多补 7 天 */
export function windowStart(lastChecked: string | null, today: string): string {
  const floor = addDays(today, -MAX_CATCHUP_DAYS);
  if (!lastChecked) return addDays(today, -1);
  return lastChecked < floor ? floor : lastChecked;
}

const LINE = {
  zh: {
    recheck: (names: string[]) => `复查 ${names.join("、")}`,
    annual: "年度体检",
    fallback: "用药",
    expiry: (name: string) => `${name} 有效期到期`,
    end: (name: string) => `${name} 计划结束，评估是否继续`,
    when: (due: string, days: number) => (days < 0 ? `${due}（已逾期 ${-days} 天）` : days === 0 ? `${due}（今天）` : `${due}（还有 ${days} 天）`),
  },
  en: {
    recheck: (names: string[]) => `Recheck ${names.join(", ")}`,
    annual: "Annual checkup",
    fallback: "Medication",
    expiry: (name: string) => `${name} expires`,
    end: (name: string) => `${name} ends as planned; review whether to continue`,
    when: (due: string, days: number) => {
      const n = Math.abs(days);
      const span = `${n} ${n === 1 ? "day" : "days"}`;
      return days < 0 ? `${due} (${span} overdue)` : days === 0 ? `${due} (today)` : `${due} (in ${span})`;
    },
  },
};

/** 邮件里的一行：成员 · 日期 · 项目名（只写名称和日期，不写数值与分析） */
export function itemLine(d: DueItem, catalog: Catalog, today: string, locale: Locale = "zh"): { who: string; what: string; when: string } {
  const x = d.item;
  const c = LINE[locale];
  const names = x.codes.map((code) => { const e = catalog.get(code); return (locale === "en" ? e?.name_en : e?.name) ?? e?.name ?? code; });
  const item = String(x.params.name ?? c.fallback);
  const what = x.kind === "recheck" ? c.recheck(names)
    : x.kind === "annual-checkup" ? c.annual
    : x.kind === "supply-expiry" ? c.expiry(item)
    : c.end(item);
  const days = Math.round((Date.parse(x.due) - Date.parse(today)) / 86_400_000);
  return { who: d.memberName, what, when: c.when(x.due, days) };
}

// ---- 设置 ----

export type ReminderSetting = typeof reminderSetting.$inferSelect;

export async function getSetting(db: DB, userId: string): Promise<ReminderSetting | undefined> {
  const [row] = await db.select().from(reminderSetting).where(eq(reminderSetting.userId, userId));
  return row;
}

async function upsert(db: DB, userId: string, set: Partial<typeof reminderSetting.$inferInsert>) {
  await db.insert(reminderSetting).values({ userId, ...set })
    .onConflictDoUpdate({ target: reminderSetting.userId, set: { ...set, updatedAt: new Date() } });
}

/** 启用时从今天开始算（不补发启用前的提醒）；暂停只关开关，保留其余设置 */
export const setEnabled = (db: DB, userId: string, enabled: boolean, today = todayCN()) =>
  upsert(db, userId, enabled ? { enabled, lastChecked: addDays(today, -1) } : { enabled });

export async function setLeadDays(db: DB, userId: string, input: number[]) {
  const lead = [...new Set(input)].filter((n) => (LEAD_CHOICES as readonly number[]).includes(n)).sort((a, b) => b - a);
  await upsert(db, userId, { leadDays: lead.length ? lead : DEFAULT_LEAD });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const codeHash = (userId: string, email: string, code: string) => sha256(`${userId}:${email}:${code}`);

/** 换收件邮箱第一步：生成 6 位验证码（发到新邮箱），5 分钟有效；回到登录邮箱不需要验证 */
export async function requestEmailChange(db: DB, userId: string, loginEmail: string, raw: string): Promise<{ code?: string; reset?: boolean }> {
  const email = raw.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) throw new Error("invalid email");
  if (email === loginEmail.toLowerCase()) {
    await upsert(db, userId, { email: null, pendingEmail: null, pendingCodeHash: null, pendingExpires: null, pendingTries: 0 });
    return { reset: true };
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await upsert(db, userId, { pendingEmail: email, pendingCodeHash: codeHash(userId, email, code), pendingExpires: new Date(Date.now() + CODE_TTL_MS), pendingTries: 0 });
  return { code };
}

/** 换收件邮箱第二步：验证码正确才生效；错 5 次作废 */
export async function confirmEmailChange(db: DB, userId: string, code: string, now = new Date()): Promise<boolean> {
  const s = await getSetting(db, userId);
  if (!s?.pendingEmail || !s.pendingCodeHash || !s.pendingExpires || s.pendingExpires < now || s.pendingTries >= MAX_TRIES) return false;
  const ok = crypto.timingSafeEqual(Buffer.from(codeHash(userId, s.pendingEmail, code.trim())), Buffer.from(s.pendingCodeHash));
  if (!ok) {
    await upsert(db, userId, { pendingTries: s.pendingTries + 1 });
    return false;
  }
  await upsert(db, userId, { email: s.pendingEmail, pendingEmail: null, pendingCodeHash: null, pendingExpires: null, pendingTries: 0 });
  return true;
}

// ---- 一键暂停链接（邮件里用；签名防伪造，不需要登录） ----

const pauseSig = (kek: Buffer, userId: string) => crypto.createHmac("sha256", kek).update(`reminder-pause:${userId}`).digest("base64url");

export const pauseParams = (kek: Buffer, userId: string) => new URLSearchParams({ u: userId, s: pauseSig(kek, userId) }).toString();

export function verifyPause(kek: Buffer, userId: string, sig: string): boolean {
  const want = Buffer.from(pauseSig(kek, userId));
  const got = Buffer.from(sig);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// ---- 每日任务 ----

export interface ReminderMail { to: string; userId: string; locale: Locale; items: { who: string; what: string; when: string }[] }

/** 触发日落在 (from, to] 的提醒内容；today 用来算「还有几天」（设置页预览会把 to 设在未来） */
export async function collect(db: DB, kek: Buffer, userId: string, w: { leadDays: number[]; from: string; to: string; today?: string; locale?: Locale }) {
  const { leadDays, from, to, today = to, locale = "zh" } = w;
  const snap = await new PgRepository(db, userId, kek).snapshot();
  const members = snap.members.map((m: MemberBundle) => ({ id: m.id, name: m.name, items: schedule(m, today) }));
  return dueItems(members, leadDays, from, to).map((d) => itemLine(d, snap.catalog, today, locale));
}

/** 每天跑一次：未暂停、未停用的账号逐个检查；出错只记账号 id，不记健康内容 */
export async function runReminderJob(db: DB, kek: Buffer, send: (m: ReminderMail) => Promise<void>, today = todayCN()) {
  // 默认开启：没有设置行的账号也算启用，只排除手动暂停的、被停用的
  const rows = await db.select({ s: reminderSetting, userId: user.id, loginEmail: user.email, locale: user.locale })
    .from(user)
    .leftJoin(reminderSetting, eq(reminderSetting.userId, user.id))
    .leftJoin(userStatus, eq(userStatus.userId, user.id))
    .where(and(
      or(isNull(reminderSetting.enabled), eq(reminderSetting.enabled, true)),
      isNull(userStatus.disabledAt),
      exists(db.select({ x: member.id }).from(member).where(eq(member.userId, user.id))), // 还没建档的账号不检查，也不替它生成密钥
    ));
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      if (await checkOne({ db, kek, send, today }, row)) sent++;
    } catch (e) {
      failed++;
      console.error("reminder job failed", row.userId, e instanceof Error ? e.name : "error");
    }
  }
  return { checked: rows.length, sent, failed };
}

/** 检查一个账号；没有设置行时用默认值。返回是否发了邮件 */
async function checkOne(ctx: { db: DB; kek: Buffer; send: (m: ReminderMail) => Promise<void>; today: string }, row: { s: ReminderSetting | null; userId: string; loginEmail: string; locale: string | null }) {
  const { db, kek, send, today } = ctx;
  const { s, userId } = row;
  const from = windowStart(s?.lastChecked ?? null, today);
  if (from >= today) return false; // 今天已经检查过
  const locale = toLocale(row.locale);
  const items = await collect(db, kek, userId, { leadDays: s?.leadDays ?? DEFAULT_LEAD, from, to: today, locale });
  if (items.length) await send({ to: s?.email ?? row.loginEmail, userId, locale, items });
  await upsert(db, userId, { lastChecked: today, ...(items.length ? { lastSentAt: new Date() } : {}) });
  return items.length > 0;
}
