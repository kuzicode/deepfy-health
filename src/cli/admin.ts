import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { createDb } from "../db/client";
import { account, session, user } from "../db/schema";
import { randomId } from "../server/crypto";

// 自托管维护命令（在服务器上运行，不经过网页）：
//   docker compose run --rm migrate pnpm admin reset-password <邮箱>
// 生成一个新密码并打印出来，该账号所有设备下线。用于管理员自己忘了密码。

const USAGE = "用法：pnpm admin reset-password <邮箱>";

async function resetPassword(email: string) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("没有 DATABASE_URL");
  const db = createDb(url);
  try {
    const target = await db.query.user.findFirst({ where: eq(user.email, email.trim().toLowerCase()) });
    if (!target) throw new Error(`没有这个账号：${email}`);
    const password = randomBytes(12).toString("base64url");
    const hash = await hashPassword(password);
    const updated = await db.update(account).set({ password: hash, updatedAt: new Date() })
      .where(and(eq(account.userId, target.id), eq(account.providerId, "credential"))).returning({ id: account.id });
    if (!updated.length) await db.insert(account).values({ id: randomId(), accountId: target.id, providerId: "credential", userId: target.id, password: hash });
    await db.delete(session).where(eq(session.userId, target.id));
    console.log(`已重置 ${target.email} 的密码，所有设备已退出登录。\n新密码：${password}\n登录后请在「设置」里改成自己的密码。`);
  } finally {
    await db.$client.end();
  }
}

const [cmd, arg] = process.argv.slice(2);
if (cmd !== "reset-password" || !arg) {
  console.error(USAGE);
  process.exit(1);
}
resetPassword(arg).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
