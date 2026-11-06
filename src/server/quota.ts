import { and, count, eq, gt, inArray, sql, sum } from "drizzle-orm";
import type { DB } from "@/db/client";
import { accountPlan, agentChange, apiToken, attachment, doc, member, user } from "@/db/schema";
import { isAdminEmail } from "./access";
import { createBudget } from "./throttle";

// 账号额度（所有人都是 free）：家人数、附件、文档、token 数、agent 每日写入、导出次数。
// 瓶颈在磁盘：覆盖上传的旧文件要留 48 小时才清理，所以除了总量还限每天的上传量。文字数据一年只有几 MB，上限只防滥用。

const MB = 1024 * 1024;

const UNLIMITED = Number.POSITIVE_INFINITY;

export const PLANS = {
  free: { members: 6, attachmentBytes: 500 * MB, attachmentCount: 2000, uploadBytesPerDay: 1024 * MB, docs: 5000, docBytes: 100 * MB, tokens: 3, mcpWritesPerDay: 200, exportsPerDay: 3 },
  pro: { members: 20, attachmentBytes: 10 * 1024 * MB, attachmentCount: 20000, uploadBytesPerDay: 20 * 1024 * MB, docs: 50000, docBytes: 2048 * MB, tokens: 10, mcpWritesPerDay: 2000, exportsPerDay: 10 },
  /** 管理员（KZ_ADMIN_EMAILS）：不受额度限制；频率限制（MCP 每分钟、验证码）照常 */
  admin: { members: UNLIMITED, attachmentBytes: UNLIMITED, attachmentCount: UNLIMITED, uploadBytesPerDay: UNLIMITED, docs: UNLIMITED, docBytes: UNLIMITED, tokens: UNLIMITED, mcpWritesPerDay: UNLIMITED, exportsPerDay: UNLIMITED },
} as const;

export type Plan = keyof typeof PLANS;
export type Limits = { [K in keyof (typeof PLANS)["free"]]: number };
export type QuotaResource = "members" | "attachmentBytes" | "attachmentCount" | "uploadBytesPerDay" | "docs" | "docBytes" | "tokens" | "mcpWritesPerDay";

/** 读额度用的查询对象：数据库或事务（在账号写锁内检查时传事务） */
type Q = Pick<DB, "select">;

/**
 * 账号写锁（事务级 advisory lock，与 PgRepository 共用同一个键）：额度检查和写入在同一把锁内完成，
 * 并发请求不能各自读到「还没超」再一起写进去。
 */
export const lockUser = (tx: Pick<DB, "execute">, userId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`kzh-write:${userId}`}))`);

export class QuotaExceeded extends Error {
  constructor(readonly resource: QuotaResource, readonly limit: number) {
    super(`quota exceeded: ${resource} (limit ${limit})`);
  }
}

/** 管理员邮箱 → admin；account_plan 里是 pro → pro；其余（包括没有记录）→ free */
export async function planOf(db: Q, userId: string): Promise<Plan> {
  const [row] = await db.select({ plan: accountPlan.plan, email: user.email }).from(user)
    .leftJoin(accountPlan, eq(accountPlan.userId, user.id)).where(eq(user.id, userId));
  if (isAdminEmail(row?.email)) return "admin";
  return row?.plan === "pro" ? "pro" : "free";
}

export const limitsOf = async (db: Q, userId: string): Promise<Limits> => PLANS[await planOf(db, userId)];
export const isUnlimited = (n: number) => !Number.isFinite(n);

const DAY_MS = 86_400_000;

/** 当前用量（设置页、后台展示，也用于超额判断） */
export async function usageOf(db: Q, userId: string, now = new Date()) {
  const ids = (await db.select({ id: member.id }).from(member).where(eq(member.userId, userId))).map((m) => m.id);
  const [[{ bytes, files }], [{ docs, docBytes }], [{ tokens }], [{ writes }]] = await Promise.all([
    ids.length ? db.select({ bytes: sum(attachment.size), files: count() }).from(attachment).where(inArray(attachment.memberId, ids)) : Promise.resolve([{ bytes: "0", files: 0 }]),
    ids.length ? db.select({ docs: count(), docBytes: sum(sql`octet_length(${doc.ciphertext})`) }).from(doc).where(inArray(doc.memberId, ids)) : Promise.resolve([{ docs: 0, docBytes: "0" }]),
    db.select({ tokens: count() }).from(apiToken).where(eq(apiToken.userId, userId)),
    db.select({ writes: count() }).from(agentChange).where(and(eq(agentChange.userId, userId), gt(agentChange.createdAt, new Date(now.getTime() - DAY_MS)))),
  ]);
  return { members: ids.length, attachmentBytes: Number(bytes ?? 0), attachmentCount: files, docs, docBytes: Number(docBytes ?? 0), tokens, mcpWritesPerDay: writes };
}

/** 加上 adding 之后是否超额；超额抛 QuotaExceeded（调用方不写入任何东西）。要防并发，在 lockUser 之后用同一个事务调用 */
export async function assertQuota(db: Q, userId: string, resource: Exclude<QuotaResource, "uploadBytesPerDay">, adding = 1) {
  const [limits, used] = await Promise.all([limitsOf(db, userId), usageOf(db, userId)]);
  if (used[resource] + adding > limits[resource]) throw new QuotaExceeded(resource, limits[resource]);
}

/** 写入后在同一事务里检查文档总量，超额就抛错让整个事务回滚 */
export async function assertDocQuota(db: Q, userId: string) {
  const [limits, used] = await Promise.all([limitsOf(db, userId), usageOf(db, userId)]);
  for (const r of ["docs", "docBytes"] as const) if (used[r] > limits[r]) throw new QuotaExceeded(r, limits[r]);
}

const uploads = createBudget(DAY_MS);

/** 每天的上传量（内存计数，重启清零）：反复覆盖同一路径不占总量，但旧文件要留 48 小时 */
export async function consumeUpload(db: Q, userId: string, bytes: number) {
  const max = (await limitsOf(db, userId)).uploadBytesPerDay;
  if (!isUnlimited(max) && !uploads(userId, bytes, max)) throw new QuotaExceeded("uploadBytesPerDay", max);
}
