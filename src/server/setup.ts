import { user } from "@/db/schema";
import type { DB } from "@/db/client";

// 自托管版的首次设置：一个账号都没有时，登录页跳到 /setup 创建所有者（管理员）。

let done = false;

/** 已经有账号了吗。一旦为真就不会再变回假（删光账号也不重新开放设置，避免被人抢先），缓存下来省一次查询 */
export async function setupDone(db: Pick<DB, "select">) {
  if (done) return true;
  const rows = await db.select({ id: user.id }).from(user).limit(1);
  done = rows.length > 0;
  return done;
}

/**
 * /setup 只接受本机或局域网的地址（localhost、IP、.local / .lan / .home.arpa / .internal）。
 * 防 DNS rebinding：恶意网页把自己的域名解析到 127.0.0.1，抢在主人之前提交设置表单，成为管理员
 */
export function isLocalHost(hostHeader: string | null | undefined) {
  const raw = (hostHeader ?? "").trim().toLowerCase();
  const host = raw.startsWith("[") ? raw.slice(1, raw.indexOf("]")) : raw.replace(/:\d+$/, "");
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.includes(":")) return /^[0-9a-f:.]+$/.test(host); // IPv6 字面量
  return /\.(local|lan|home\.arpa|internal)$/.test(host);
}
