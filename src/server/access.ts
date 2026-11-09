import { and, eq, lt, notExists } from "drizzle-orm";
import type { DB } from "@/db/client";
import { allowedEmail, member, session, user, userStatus } from "@/db/schema";
import { isHosted } from "./edition";

// 访问控制：管理员只来自环境变量（网页上不能提权）。设了 KZ_ALLOWED_EMAILS 就是白名单制：名单 = 环境变量 ∪ 后台 allowed_email（审批通过的申请）∪ 管理员。
// 留空是开放注册，只用于自托管，官方实例必须设。被拉黑（停用）的账号不能登录、token 失效

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export const adminEmails = () => list(process.env.KZ_ADMIN_EMAILS);
export const isAdminEmail = (email: string | null | undefined) => !!email && adminEmails().includes(normalizeEmail(email));

const allowList = () => list(process.env.KZ_ALLOWED_EMAILS);

/** 是否是白名单制。官方实例必须设 KZ_ALLOWED_EMAILS（部署脚本会检查）；自托管版没有公开注册，不用名单 */
export const registrationRestricted = () => isHosted() && allowList().length > 0;

export async function isEmailAllowed(db: DB, email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const e = normalizeEmail(email);
  if (!registrationRestricted() || allowList().includes(e) || isAdminEmail(e)) return true;
  return !!(await db.query.allowedEmail.findFirst({ where: eq(allowedEmail.email, e) }));
}

export async function isDisabled(db: DB, userId: string): Promise<boolean> {
  const row = await db.query.userStatus.findFirst({ where: eq(userStatus.userId, userId) });
  return !!row?.disabledAt;
}

/** 停用时同时删掉所有会话，立即下线 */
export async function setDisabled(db: DB, userId: string, disabled: boolean, reason?: string) {
  // 解除时删掉记录：有记录的账号不会被未验证清理跳过
  if (!disabled) {
    await db.delete(userStatus).where(eq(userStatus.userId, userId));
    return;
  }
  const values = { disabledAt: new Date(), reason: reason ?? null };
  await db.insert(userStatus).values({ userId, ...values }).onConflictDoUpdate({ target: userStatus.userId, set: values });
  await db.delete(session).where(eq(session.userId, userId));
}

/** 管理员要停用的目标：身份以数据库为准；自己和其他管理员不可停用 */
export async function disableTarget(db: DB, adminId: string, userId: string) {
  const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!target || target.id === adminId || isAdminEmail(target.email)) return undefined;
  return target;
}

export async function addAllowedEmail(db: DB, email: string, note: string | undefined, by: string) {
  const e = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("invalid_email");
  await db.insert(allowedEmail).values({ email: e, note: note?.trim() || null, createdBy: by }).onConflictDoNothing();
}

export const removeAllowedEmail = (db: DB, email: string) => db.delete(allowedEmail).where(eq(allowedEmail.email, normalizeEmail(email)));

const UNVERIFIED_RETENTION_MS = 7 * 86_400_000;

/** 清理超过 7 天仍未验证邮箱的账号；有 user_status 记录的账号是后台处理过的，不动。删除不可恢复，所以有档案的账号也不动 */
export async function deleteStaleUnverified(db: DB, now = new Date()) {
  const rows = await db.delete(user).where(and(
    eq(user.emailVerified, false),
    lt(user.createdAt, new Date(now.getTime() - UNVERIFIED_RETENTION_MS)),
    notExists(db.select({ id: userStatus.userId }).from(userStatus).where(eq(userStatus.userId, user.id))),
    notExists(db.select({ id: member.id }).from(member).where(eq(member.userId, user.id))),
  )).returning({ id: user.id });
  return rows.length;
}
