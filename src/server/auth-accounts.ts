import { and, count, eq } from "drizzle-orm";
import type { AuthContext, BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { z } from "zod";
import { getDb } from "@/db/client";
import { account, opsState, session, user } from "@/db/schema";
import { normalizeEmail, OWNER_KEY } from "./access";
import { isSelfHosted } from "./edition";

// 自托管版的账号管理：首次设置创建所有者、管理员添加账号、重置密码。
// 都是 server-only 端点：不挂到 HTTP 路由上，只能由服务端代码（已校验管理员的 server action）经 getAuth().api.* 调用。
// 走 better-auth 的端点上下文建号，ensureUserKey、头像分配等数据库钩子照常执行。
// 不能直接调 internalAdapter.createUser：配置了 validateUserInfo 时，没有端点上下文会报 validation_context_missing。

const password = z.string().min(8).max(128);
const account_ = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().max(254).pipe(z.email()), password });

function assertSelfHosted() {
  if (!isSelfHosted()) throw new APIError("NOT_FOUND");
}

/** 建号：邮箱视为已验证（自托管不发信），设好密码 */
async function createAccount(c: AuthContext, body: z.infer<typeof account_>) {
  const email = normalizeEmail(body.email);
  if (await c.internalAdapter.findUserByEmail(email)) throw new APIError("BAD_REQUEST", { code: "user_exists", message: "User already exists" });
  const created = await c.internalAdapter.createUser({ email, name: body.name, emailVerified: true }, { method: "admin" });
  if (!created) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Failed to create user" });
  await c.internalAdapter.linkAccount({ providerId: "credential", accountId: created.id, userId: created.id, password: await c.password.hash(body.password) });
  return created;
}

export const kzAccounts = () => ({
  id: "kz-accounts",
  endpoints: {
    /**
     * 首次设置：只在一个账号都没有时可用。先插入 owner 占位（主键冲突说明别的请求已经在建），再确认没有账号，
     * 建号后写入 userId；中途失败删掉占位，可以重试
     */
    kzSetupOwner: createAuthEndpoint.serverOnly({ method: "POST", body: account_ }, async (ctx) => {
      assertSelfHosted();
      const db = getDb();
      const claimed = await db.insert(opsState).values({ key: OWNER_KEY, value: {} }).onConflictDoNothing().returning({ key: opsState.key });
      if (!claimed.length) throw new APIError("FORBIDDEN", { code: "setup_done", message: "Setup already done" });
      try {
        const [{ n }] = await db.select({ n: count() }).from(user);
        if (n > 0) throw new APIError("FORBIDDEN", { code: "setup_done", message: "Setup already done" });
        const created = await createAccount(ctx.context, ctx.body);
        await db.update(opsState).set({ value: { userId: created.id }, updatedAt: new Date() }).where(eq(opsState.key, OWNER_KEY));
        return ctx.json({ userId: created.id });
      } catch (e) {
        await db.delete(opsState).where(eq(opsState.key, OWNER_KEY));
        throw e;
      }
    }),

    /** 管理员添加账号（调用方先校验管理员） */
    kzCreateUser: createAuthEndpoint.serverOnly({ method: "POST", body: account_ }, async (ctx) => {
      assertSelfHosted();
      const created = await createAccount(ctx.context, ctx.body);
      return ctx.json({ userId: created.id });
    }),

    /** 管理员重置密码：没有密码的账号补上密码；重置后该账号所有设备下线 */
    kzSetUserPassword: createAuthEndpoint.serverOnly({ method: "POST", body: z.object({ userId: z.string().min(1).max(100), password }) }, async (ctx) => {
      assertSelfHosted();
      const db = getDb();
      const target = await db.query.user.findFirst({ where: eq(user.id, ctx.body.userId) });
      if (!target) throw new APIError("NOT_FOUND");
      const hash = await ctx.context.password.hash(ctx.body.password);
      const updated = await db.update(account).set({ password: hash, updatedAt: new Date() })
        .where(and(eq(account.userId, target.id), eq(account.providerId, "credential"))).returning({ id: account.id });
      if (!updated.length) await ctx.context.internalAdapter.linkAccount({ providerId: "credential", accountId: target.id, userId: target.id, password: hash });
      await db.delete(session).where(eq(session.userId, target.id));
      return ctx.json({ ok: true });
    }),
  },
}) satisfies BetterAuthPlugin;
