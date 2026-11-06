import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DB } from "@/db/client";
import { allowedEmail, session, user } from "@/db/schema";
import { addAllowedEmail, disableTarget, isAdminEmail, isDisabled, isEmailAllowed, removeAllowedEmail, setDisabled } from "./access";
import { listUsers } from "./admin";
import { randomId } from "./crypto";
import { createToken, userIdForToken } from "./tokens";

const URL = process.env.KZ_TEST_DATABASE_URL;
const ENV = { allowed: process.env.KZ_ALLOWED_EMAILS, admins: process.env.KZ_ADMIN_EMAILS };

describe.skipIf(!URL)("访问控制与管理后台（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const uid = `acc-${randomId()}`;
  const email = `${uid}@example.com`;

  beforeAll(async () => {
    db = createDb(URL!);
    await db.delete(allowedEmail);
    await db.insert(user).values({ id: uid, name: "acc", email });
  });
  afterEach(async () => {
    process.env.KZ_ALLOWED_EMAILS = ENV.allowed ?? "";
    process.env.KZ_ADMIN_EMAILS = ENV.admins ?? "";
    await db.delete(allowedEmail);
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, uid));
    await db.$client.end();
  });

  it("什么都没配置时开放注册", async () => {
    process.env.KZ_ALLOWED_EMAILS = "";
    process.env.KZ_ADMIN_EMAILS = "";
    expect(await isEmailAllowed(db, "anyone@example.com")).toBe(true);
  });

  it("配置管理员后只允许名单内邮箱；后台添加的邮箱生效，移除后失效", async () => {
    process.env.KZ_ADMIN_EMAILS = "Boss@Example.com";
    process.env.KZ_ALLOWED_EMAILS = "env@example.com";
    expect(isAdminEmail("boss@example.com")).toBe(true);
    expect(await isEmailAllowed(db, "BOSS@example.com")).toBe(true);
    expect(await isEmailAllowed(db, "env@example.com")).toBe(true);
    expect(await isEmailAllowed(db, "new@example.com")).toBe(false);
    await addAllowedEmail(db, " New@Example.com ", "家人", "boss@example.com");
    expect(await isEmailAllowed(db, "new@example.com")).toBe(true);
    await removeAllowedEmail(db, "new@example.com");
    expect(await isEmailAllowed(db, "new@example.com")).toBe(false);
    await expect(addAllowedEmail(db, "not-an-email", undefined, "x")).rejects.toThrow("invalid_email");
  });

  it("停用账号：删除会话、token 失效；启用后恢复", async () => {
    const token = await createToken(db, uid, "t");
    await db.insert(session).values({ id: randomId(), token: randomId(), userId: uid, expiresAt: new Date(Date.now() + 3600_000) });
    expect(await userIdForToken(db, `Bearer ${token}`)).toBe(uid);
    await setDisabled(db, uid, true, "test");
    expect(await isDisabled(db, uid)).toBe(true);
    expect(await db.select().from(session).where(eq(session.userId, uid))).toEqual([]);
    expect(await userIdForToken(db, `Bearer ${token}`)).toBeUndefined();
    await setDisabled(db, uid, false);
    expect(await userIdForToken(db, `Bearer ${token}`)).toBe(uid);
  });

  it("停用目标以数据库邮箱为准：管理员和自己不可停用", async () => {
    process.env.KZ_ADMIN_EMAILS = `boss@example.com,${email}`;
    expect(await disableTarget(db, "someone-else", uid)).toBeUndefined();
    process.env.KZ_ADMIN_EMAILS = "boss@example.com";
    expect(await disableTarget(db, uid, uid)).toBeUndefined();
    expect((await disableTarget(db, "someone-else", uid))?.id).toBe(uid);
    expect(await disableTarget(db, "someone-else", "no-such-user")).toBeUndefined();
  });

  it("用户列表只有元数据与数量", async () => {
    const row = (await listUsers(db)).find((u) => u.id === uid)!;
    expect(row).toMatchObject({ email, members: 0, docs: 0, attachmentBytes: 0, tokens: 1, disabledAt: null });
    expect(Object.keys(row).sort()).toEqual(["attachmentBytes", "createdAt", "disabledAt", "docs", "email", "id", "isAdmin", "lastSeen", "members", "name", "plan", "providers", "tokens", "verified"]);
  });
});
