import { and, eq, lt, notExists } from "drizzle-orm";
import type { DB } from "@/db/client";
import { session, user, userStatus } from "@/db/schema";

// 访问控制：管理员只来自环境变量（网页上不能提权）；默认开放注册，KZ_ALLOWED_EMAILS 可把实例限制为指定邮箱（自托管用）；被拉黑（停用）的账号不能登录、token 失效

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export const adminEmails = () => list(process.env.KZ_ADMIN_EMAILS);
export const isAdminEmail = (email: string | null | undefined) => !!email && adminEmails().includes(normalizeEmail(email));

const allowList = () => list(process.env.KZ_ALLOWED_EMAILS);

/** 是否只允许名单内的邮箱注册；官方实例留空，即开放注册 */
export const registrationRestricted = () => allowList().length > 0;

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = normalizeEmail(email);
  return !registrationRestricted() || allowList().includes(e) || isAdminEmail(e);
}

export async function isDisabled(db: DB, userId: string): Promise<boolean> {
  const row = await db.query.userStatus.findFirst({ where: eq(userStatus.userId, userId) });
  return !!row?.disabledAt;
}

/** 停用时同时删掉所有会话，立即下线 */
export async function setDisabled(db: DB, userId: string, disabled: boolean, reason?: string) {
  await db.insert(userStatus).values({ userId, disabledAt: disabled ? new Date() : null, reason: reason ?? null })
    .onConflictDoUpdate({ target: userStatus.userId, set: { disabledAt: disabled ? new Date() : null, reason: reason ?? null } });
  if (disabled) await db.delete(session).where(eq(session.userId, userId));
}

/** 管理员要停用的目标：身份以数据库为准；自己和其他管理员不可停用 */
export async function disableTarget(db: DB, adminId: string, userId: string) {
  const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!target || target.id === adminId || isAdminEmail(target.email)) return undefined;
  return target;
}

const UNVERIFIED_RETENTION_MS = 7 * 86_400_000;

/** 清理超过 7 天仍未验证邮箱的账号（它们不可能有档案）；有 user_status 记录的账号是后台处理过的，不动 */
export async function deleteStaleUnverified(db: DB, now = new Date()) {
  const rows = await db.delete(user).where(and(
    eq(user.emailVerified, false),
    lt(user.createdAt, new Date(now.getTime() - UNVERIFIED_RETENTION_MS)),
    notExists(db.select({ id: userStatus.userId }).from(userStatus).where(eq(userStatus.userId, user.id))),
  )).returning({ id: user.id });
  return rows.length;
}
