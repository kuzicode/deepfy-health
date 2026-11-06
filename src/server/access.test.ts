import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DB } from "@/db/client";
import { member, session, user, userStatus } from "@/db/schema";
import { deleteStaleUnverified, disableTarget, isAdminEmail, isDisabled, isEmailAllowed, registrationRestricted, setDisabled } from "./access";
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
    await db.insert(user).values({ id: uid, name: "acc", email });
  });
  afterEach(async () => {
    process.env.KZ_ALLOWED_EMAILS = ENV.allowed ?? "";
    process.env.KZ_ADMIN_EMAILS = ENV.admins ?? "";
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, uid));
    await db.$client.end();
  });

  it("没有设名单时开放注册，配了管理员也一样", () => {
    process.env.KZ_ALLOWED_EMAILS = "";
    process.env.KZ_ADMIN_EMAILS = "";
    expect(registrationRestricted()).toBe(false);
    expect(isEmailAllowed("anyone@example.com")).toBe(true);
    process.env.KZ_ADMIN_EMAILS = "boss@example.com";
    expect(isEmailAllowed("anyone@example.com")).toBe(true);
    expect(isEmailAllowed("")).toBe(false);
  });

  it("设了名单后只允许名单内的邮箱和管理员（大小写不敏感）", () => {
    process.env.KZ_ADMIN_EMAILS = "Boss@Example.com";
    process.env.KZ_ALLOWED_EMAILS = "family@example.com";
    expect(registrationRestricted()).toBe(true);
    expect(isAdminEmail("boss@example.com")).toBe(true);
    expect(isEmailAllowed("BOSS@example.com")).toBe(true);
    expect(isEmailAllowed(" Family@Example.com ")).toBe(true);
    expect(isEmailAllowed("stranger@example.com")).toBe(false);
  });

  it("清理未验证账号：只删超过 7 天的，已验证和被拉黑的不动", async () => {
    const old = new Date(Date.now() - 8 * 86_400_000);
    const ids = { stale: `s-${randomId()}`, recent: `r-${randomId()}`, verified: `v-${randomId()}`, blocked: `b-${randomId(), withData: `stale-data-${randomId()}`}` };
    await db.insert(user).values([
      { id: ids.stale, name: "x", email: `${ids.stale}@example.com`, createdAt: old },
      { id: ids.recent, name: "x", email: `${ids.recent}@example.com` },
      { id: ids.verified, name: "x", email: `${ids.verified}@example.com`, emailVerified: true, createdAt: old },
      { id: ids.blocked, name: "x", email: `${ids.blocked}@example.com`, createdAt: old },
      { id: ids.withData, name: "x", email: `${ids.withData}@example.com`, createdAt: old },
    ]);
    await db.insert(member).values({ id: randomId(), userId: ids.withData, slug: "m", nameCipher: "x" });
    await db.insert(userStatus).values({ userId: ids.blocked, disabledAt: new Date() });
    expect(await deleteStaleUnverified(db)).toBeGreaterThanOrEqual(1);
    const left = (await db.select({ id: user.id }).from(user)).map((u) => u.id);
    expect(left).not.toContain(ids.stale);
    expect(left).toEqual(expect.arrayContaining([ids.recent, ids.verified, ids.blocked, ids.withData]));
    for (const id of Object.values(ids)) await db.delete(user).where(eq(user.id, id));
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
    expect(await db.select().from(userStatus).where(eq(userStatus.userId, uid))).toEqual([]);
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
