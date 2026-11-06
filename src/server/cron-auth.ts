import crypto from "node:crypto";

// /api/cron/* 只由服务器定时任务调用；反向代理必须对外拒绝 /api/cron/。
// 鉴权：Authorization: Bearer KZ_CRON_SECRET（至少 32 字符，常量时间比较）；不通过一律 404。

export function cronAuthorized(req: Request) {
  const secret = process.env.KZ_CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secret.length < 32 || got.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}
