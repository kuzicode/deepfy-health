import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { account, user } from "@/db/schema";
import { isEmailAllowed, normalizeEmail } from "./access";

// 登录页「先邮箱后分流」：告诉前端下一步是输密码、验证码、创建账号，还是不在已开通名单（前端转到「申请抢先体验」）。
// 已知取舍：会暴露某邮箱是否注册过（与 ChatGPT 等一致），因此按 IP 限速。停用账号照常分流，登录时由 auth 钩子拦截。

export type LookupNext = "password" | "otp" | "create" | "closed";

export async function lookupEmail(db: DB, email: string): Promise<LookupNext> {
  const e = normalizeEmail(email);
  const u = await db.query.user.findFirst({ where: eq(user.email, e) });
  if (u) {
    const cred = await db.query.account.findFirst({ where: and(eq(account.userId, u.id), eq(account.providerId, "credential")) });
    return cred?.password ? "password" : "otp";
  }
  return (await isEmailAllowed(db, e)) ? "create" : "closed";
}

/** 内存滑动窗口限速（单实例部署足够）；返回 true 表示放行 */
export function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()) => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return true;
  };
}

/** 限速键：nginx 设置 X-Real-IP = $remote_addr；X-Forwarded-For 的首段可被客户端伪造，只取最后一段兜底 */
export const clientIp = (req: Request) =>
  req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") ?? "").split(",").pop()?.trim() || "local";
