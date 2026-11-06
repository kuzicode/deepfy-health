import { count, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { allowedEmail, session, user, userStatus } from "@/db/schema";

// 访问控制：管理员只来自环境变量（网页上不能提权）；白名单 = 环境变量 ∪ 数据库；停用的账号不能登录、token 失效

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export const adminEmails = () => list(process.env.KZ_ADMIN_EMAILS);
export const isAdminEmail = (email: string | null | undefined) => !!email && adminEmails().includes(normalizeEmail(email));

export async function isEmailAllowed(db: DB, email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const e = normalizeEmail(email);
  const env = list(process.env.KZ_ALLOWED_EMAILS);
  if (env.includes(e) || isAdminEmail(e)) return true;
  if (await db.query.allowedEmail.findFirst({ where: eq(allowedEmail.email, e) })) return true;
  const [{ n }] = await db.select({ n: count() }).from(allowedEmail);
  return env.length === 0 && adminEmails().length === 0 && n === 0; // 都没配置时开放注册
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

export async function addAllowedEmail(db: DB, email: string, note: string | undefined, by: string) {
  const e = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("invalid_email");
  await db.insert(allowedEmail).values({ email: e, note: note?.trim() || null, createdBy: by }).onConflictDoNothing();
}

export const removeAllowedEmail = (db: DB, email: string) => db.delete(allowedEmail).where(eq(allowedEmail.email, normalizeEmail(email)));
