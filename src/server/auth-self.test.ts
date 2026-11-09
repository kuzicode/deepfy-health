import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, type DB } from "@/db/client";
import { opsState, session, user } from "@/db/schema";
import { isAdmin, OWNER_KEY } from "./access";

const URL = process.env.KZ_TEST_DATABASE_URL;
const BASE = "http://192.168.1.10:3100"; // 自托管不设 BETTER_AUTH_URL，地址从请求推导：局域网 IP 也要能登录

const load = async () => (await import("./auth")).getAuth();
type Api = Awaited<ReturnType<typeof load>>["api"];
const post = async (path: string, body: object, headers: Record<string, string> = {}) => (await load()).handler(new Request(`${BASE}/api/auth${path}`, {
  method: "POST", headers: { "content-type": "application/json", origin: BASE, ...headers }, body: JSON.stringify(body),
}));
const signIn = async (email: string, password: string) => {
  const res = await post("/sign-in/email", { email, password });
  return { status: res.status, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] };
};

// 首次设置要求一个账号都没有：这个文件开头清空测试库的账号（数据库测试按文件串行，其他文件各自建号）
describe.skipIf(!URL)("自托管版账号（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  let api: Api;
  const owner = { name: "Owner", email: "owner@example.com", password: "owner-pass-1" };

  beforeAll(async () => {
    vi.stubEnv("KZ_EDITION", "self");
    vi.stubEnv("DATABASE_URL", URL!);
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("KZ_ADMIN_EMAILS", "");
    vi.stubEnv("KZ_MASTER_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1");
    db = createDb(URL!);
    await db.delete(opsState).where(eq(opsState.key, OWNER_KEY));
    await db.delete(user);
    api = (await load()).api;
  });
  afterAll(async () => {
    await db.delete(opsState).where(eq(opsState.key, OWNER_KEY));
    await db.delete(user);
    vi.unstubAllEnvs();
    await db.$client.end();
  });

  it("首次设置：并发 5 次只建出 1 个所有者，之后不能再设置", async () => {
    // 邮箱各不相同，挡住并发的是 owner 占位而不是邮箱唯一约束
    const results = await Promise.allSettled([0, 1, 2, 3, 4].map((i) => api.kzSetupOwner({ body: { ...owner, email: `owner${i}@example.com` } })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.select({ n: count() }).from(user))[0].n).toBe(1);
    const created = await db.query.user.findFirst();
    expect(created?.emailVerified).toBe(true);
    owner.email = created!.email; // 后面的用例用胜出的那个账号
    expect(await isAdmin(db, created!)).toBe(true);
    await expect(api.kzSetupOwner({ body: { ...owner, email: "late@example.com" } })).rejects.toThrow();
  });

  it("没有自助注册和验证码接口", async () => {
    const signUp = await post("/sign-up/email", { email: "stranger@example.com", password: "stranger-pass-1", name: "x" });
    const otp = await post("/email-otp/send-verification-otp", { email: owner.email, type: "sign-in" });
    const reset = await post("/request-password-reset", { email: owner.email });
    expect([signUp.status, otp.status, reset.status].every((s) => s >= 400)).toBe(true);
    expect(await db.query.user.findFirst({ where: eq(user.email, "stranger@example.com") })).toBeUndefined();
  });

  it("管理员添加的账号不用验证邮箱就能登录；重复邮箱被拒绝", async () => {
    await api.kzCreateUser({ body: { name: "Mom", email: "Mom@Example.com", password: "mom-pass-12" } });
    await expect(api.kzCreateUser({ body: { name: "Mom", email: "mom@example.com", password: "mom-pass-12" } })).rejects.toThrow();
    expect((await signIn("mom@example.com", "mom-pass-12")).status).toBe(200);
  });

  it("凭当前密码改密码；错误的当前密码不改，其他来源的请求被拒绝", async () => {
    const { cookie } = await signIn(owner.email, owner.password);
    expect((await post("/change-password", { currentPassword: "wrong-pass-1", newPassword: "owner-pass-2" }, { cookie })).status).toBeGreaterThanOrEqual(400);
    expect((await post("/change-password", { currentPassword: owner.password, newPassword: "owner-pass-2" }, { cookie, origin: "http://evil.test" })).status).toBe(403);
    expect((await post("/change-password", { currentPassword: owner.password, newPassword: "owner-pass-2" }, { cookie })).status).toBe(200);
    expect((await signIn(owner.email, owner.password)).status).toBeGreaterThanOrEqual(400);
    expect((await signIn(owner.email, "owner-pass-2")).status).toBe(200);
  });

  it("管理员重置密码：旧密码失效，该账号的会话全部删除", async () => {
    const mom = await db.query.user.findFirst({ where: eq(user.email, "mom@example.com") });
    await signIn("mom@example.com", "mom-pass-12");
    await api.kzSetUserPassword({ body: { userId: mom!.id, password: "mom-pass-new" } });
    expect(await db.query.session.findFirst({ where: eq(session.userId, mom!.id) })).toBeUndefined();
    expect((await signIn("mom@example.com", "mom-pass-12")).status).toBeGreaterThanOrEqual(400);
    expect((await signIn("mom@example.com", "mom-pass-new")).status).toBe(200);
  });

  it("官方版不能调用这些端点", async () => {
    vi.stubEnv("KZ_EDITION", "hosted");
    try {
      await expect(api.kzCreateUser({ body: { name: "x", email: "x@example.com", password: "x-pass-123" } })).rejects.toThrow();
    } finally {
      vi.stubEnv("KZ_EDITION", "self");
    }
  });
});
