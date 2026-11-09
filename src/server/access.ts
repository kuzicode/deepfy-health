import { and, eq, lt, notExists } from "drizzle-orm";
import type { DB } from "@/db/client";
import { allowedEmail, member, opsState, session, user, userStatus } from "@/db/schema";
import { isHosted, isSelfHosted } from "./edition";

// 访问控制：管理员来自环境变量，自托管版再加上首次设置时创建的所有者（网页上不能提权）。设了 KZ_ALLOWED_EMAILS 就是白名单制：名单 = 环境变量 ∪ 后台 allowed_email（审批通过的申请）∪ 管理员。
// 留空是开放注册，只用于自托管，官方实例必须设。被拉黑（停用）的账号不能登录、token 失效

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export const adminEmails = () => list(process.env.KZ_ADMIN_EMAILS);
export const isAdminEmail = (email: string | null | undefined) => !!email && adminEmails().includes(normalizeEmail(email));

/** 自托管版的所有者：ops_state 的 owner 键，值 { userId }。首次设置先写入空占位，建号成功后填上 userId */
export const OWNER_KEY = "owner";

export async function ownerId(db: Pick<DB, "select">): Promise<string | undefined> {
  if (!isSelfHosted()) return undefined;
  const [row] = await db.select({ value: opsState.value }).from(opsState).where(eq(opsState.key, OWNER_KEY));
  return (row?.value as { userId?: string } | undefined)?.userId || undefined;
}

/** 管理员：邮箱已验证，且在 KZ_ADMIN_EMAILS 里或是自托管的所有者 */
export async function isAdmin(db: Pick<DB, "select">, u: { id: string; email: string | null | undefined; emailVerified: boolean }) {
  if (!u.emailVerified) return false;
  return isAdminEmail(u.email) || (await ownerId(db)) === u.id;
}

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

/** 管理员要停用的目标：身份以数据库为准；自己和其他管理员（含所有者）不可停用 */
export async function disableTarget(db: DB, adminId: string, userId: string) {
  const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!target || target.id === adminId || isAdminEmail(target.email) || (await ownerId(db)) === target.id) return undefined;
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
