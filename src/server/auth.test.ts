import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, type DB } from "@/db/client";
import { allowedEmail, session, user, verification } from "@/db/schema";
import { randomId } from "./crypto";

const URL = process.env.KZ_TEST_DATABASE_URL;

const check = async (email: string, code: string, ip: string) => (await import("./auth")).getAuth().handler(new Request("http://localhost:3000/api/auth/email-otp/check-verification-otp", {
  method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-real-ip": ip },
  body: JSON.stringify({ email, otp: code, type: "email-verification" }),
}));

describe.skipIf(!URL)("登录安全（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  let api: Awaited<ReturnType<typeof load>>;
  const logs: string[] = [];
  const emails: string[] = [];
  const fresh = () => { const e = `auth-${randomId().toLowerCase()}@example.com`; emails.push(e); return e; };
  const load = async () => (await import("./auth")).getAuth().api;
  const otpFor = async (email: string) => {
    await vi.waitFor(() => expect(logs.some((l) => l.includes(email))).toBe(true));
    return logs.filter((l) => l.includes(email)).at(-1)!.match(/(\d{6})$/)![1];
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.KZ_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.KZ_ADMIN_EMAILS = "";
    process.env.KZ_ALLOWED_EMAILS = "";
    vi.spyOn(console, "info").mockImplementation((m: string) => { logs.push(String(m)); });
    db = createDb(URL!);
    await db.delete(allowedEmail);
    api = await load();
  });
  afterEach(() => { logs.length = 0; });
  afterAll(async () => {
    for (const e of emails) await db.delete(user).where(eq(user.email, e));
    vi.restoreAllMocks();
    await db.$client.end();
  });

  it("抢先用别人的邮箱注册：对方验证邮箱后，抢注时设的密码不能登录", async () => {
    const email = fresh();
    await api.signUpEmail({ body: { email, password: "attacker-pass-1", name: "x" } });
    await api.verifyEmailOTP({ body: { email, otp: await otpFor(email) } });
    await expect(api.signInEmail({ body: { email, password: "attacker-pass-1" } })).rejects.toThrow();
  });

  it("数据库里的验证码不是明文", async () => {
    const email = fresh();
    await api.signUpEmail({ body: { email, password: "owner-pass-11", name: "x" } });
    const otp = await otpFor(email);
    const rows = await db.select().from(verification);
    expect(rows.some((r) => r.value.startsWith(otp))).toBe(false);
  });

  it("验证码校验：同一邮箱 + IP 超限后被拒绝，别的 IP 不受影响（攻击者锁不住邮箱主人）", async () => {
    const email = fresh();
    await api.signUpEmail({ body: { email, password: "owner-pass-11", name: "x" } });
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await check(email, "000000", "10.2.0.1")).status;
    expect(last).toBe(429);
    expect((await check(email, "000000", "10.2.0.2")).status).not.toBe(429);
  });

  it("验证码校验：换 IP 分散猜，同一邮箱合计超过上限后也被拒绝", async () => {
    const email = fresh();
    await api.signUpEmail({ body: { email, password: "owner-pass-11", name: "x" } });
    let last = 0;
    for (let i = 0; i < 301; i++) last = (await check(email, "000000", `10.3.${i >> 8}.${i & 255}`)).status;
    expect(last).toBe(429);
  });

  it("不信任 Google 未验证的邮箱：不设 trustedProviders，校验钩子直接拒绝", async () => {
    const { options } = (await import("./auth")).getAuth();
    expect(options.account.accountLinking).toEqual({ enabled: true });
    const source = { action: "create-user", method: "oauth", oauth: { providerId: "google" } } as const;
    const validate = options.user!.validateUserInfo!;
    const asUser = (emailVerified: boolean) => ({ email: "g@example.com", name: "g", emailVerified });
    expect(await validate({ user: asUser(false), source })).toEqual({ error: "email_not_verified" });
    expect(await validate({ user: asUser(true), source })).toBeUndefined();
  });

  it("重置密码后，已有会话全部失效", async () => {
    const email = fresh();
    await api.signUpEmail({ body: { email, password: "owner-pass-11", name: "x" } });
    await api.verifyEmailOTP({ body: { email, otp: await otpFor(email) } });
    const [u] = await db.select().from(user).where(eq(user.email, email));
    expect((await db.select().from(session).where(eq(session.userId, u.id))).length).toBeGreaterThan(0);
    logs.length = 0;
    await api.sendVerificationOTP({ body: { email, type: "forget-password" } });
    await api.resetPasswordEmailOTP({ body: { email, otp: await otpFor(email), password: "owner-pass-22" } });
    expect(await db.select().from(session).where(eq(session.userId, u.id))).toEqual([]);
  });
});
