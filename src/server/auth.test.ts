import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, type DB } from "@/db/client";
import { session, user, verification } from "@/db/schema";
import { setDisabled } from "./access";
import { randomId } from "./crypto";

const URL = process.env.KZ_TEST_DATABASE_URL;

const check = async (email: string, code: string, ip: string) => (await import("./auth")).getAuth().handler(new Request("http://localhost:3000/api/auth/email-otp/check-verification-otp", {
  method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-real-ip": ip },
  body: JSON.stringify({ email, otp: code, type: "email-verification" }),
}));

/** 真实 better-auth 实例 + 测试库：验证码从控制台日志取（未配置 Resend 时打印），用过的邮箱结束时清理 */
function useAuthHarness() {
  const logs: string[] = [];
  const emails: string[] = [];
  const load = async () => (await import("./auth")).getAuth();
  const h = {
    logs,
    db: undefined as unknown as DB,
    api: undefined as unknown as Awaited<ReturnType<typeof load>>["api"],
    fresh: () => { const e = `auth-${randomId().toLowerCase()}@example.com`; emails.push(e); return e; },
    otpFor: async (email: string) => {
      await vi.waitFor(() => expect(logs.some((l) => l.includes(email))).toBe(true));
      return logs.filter((l) => l.includes(email)).at(-1)!.match(/(\d{6})$/)![1];
    },
    post: async (path: string, body: object) => (await load()).handler(new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify(body),
    })),
  };
  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.KZ_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.KZ_ADMIN_EMAILS = "";
    process.env.KZ_ALLOWED_EMAILS = "";
    vi.spyOn(console, "info").mockImplementation((m: string) => { logs.push(String(m)); });
    h.db = createDb(URL!);
    h.api = (await load()).api;
  });
  afterEach(() => { logs.length = 0; });
  afterAll(async () => {
    for (const e of emails) await h.db.delete(user).where(eq(user.email, e));
    vi.restoreAllMocks();
    await h.db.$client.end();
  });
  return h;
}

describe.skipIf(!URL)("登录安全（需要 KZ_TEST_DATABASE_URL）", () => {
  const h = useAuthHarness();

  it("抢先用别人的邮箱注册：对方验证邮箱后，抢注时设的密码不能登录", async () => {
    const email = h.fresh();
    await h.api.signUpEmail({ body: { email, password: "attacker-pass-1", name: "x" } });
    await h.api.verifyEmailOTP({ body: { email, otp: await h.otpFor(email) } });
    await expect(h.api.signInEmail({ body: { email, password: "attacker-pass-1" } })).rejects.toThrow();
  });

  it("数据库里的验证码不是明文", async () => {
    const email = h.fresh();
    await h.api.signUpEmail({ body: { email, password: "owner-pass-11", name: "x" } });
    const otp = await h.otpFor(email);
    const rows = await h.db.select().from(verification);
    expect(rows.some((r) => r.value.startsWith(otp))).toBe(false);
  });

  it("验证码校验：同一邮箱 + IP 超限后被拒绝，别的 IP 不受影响（攻击者锁不住邮箱主人）", async () => {
    const email = h.fresh();
    await h.api.signUpEmail({ body: { email, password: "owner-pass-11", name: "x" } });
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await check(email, "000000", "10.2.0.1")).status;
    expect(last).toBe(429);
    expect((await check(email, "000000", "10.2.0.2")).status).not.toBe(429);
  });

  it("验证码校验：换 IP 分散猜，同一邮箱合计超过上限后也被拒绝", async () => {
    const email = h.fresh();
    await h.api.signUpEmail({ body: { email, password: "owner-pass-11", name: "x" } });
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
    const email = h.fresh();
    await h.api.signUpEmail({ body: { email, password: "owner-pass-11", name: "x" } });
    await h.api.verifyEmailOTP({ body: { email, otp: await h.otpFor(email) } });
    const [u] = await h.db.select().from(user).where(eq(user.email, email));
    expect((await h.db.select().from(session).where(eq(session.userId, u.id))).length).toBeGreaterThan(0);
    h.logs.length = 0;
    await h.api.sendVerificationOTP({ body: { email, type: "forget-password" } });
    await h.api.resetPasswordEmailOTP({ body: { email, otp: await h.otpFor(email), password: "owner-pass-22" } });
    expect(await h.db.select().from(session).where(eq(session.userId, u.id))).toEqual([]);
  });
});

describe.skipIf(!URL)("开放注册与拉黑（需要 KZ_TEST_DATABASE_URL）", () => {
  const h = useAuthHarness();

  it("开放注册：配了管理员，陌生邮箱也能注册并验证", async () => {
    process.env.KZ_ADMIN_EMAILS = "boss@example.com";
    const email = h.fresh();
    const res = await h.api.signUpEmail({ body: { email, password: "owner-pass-11", name: "x" } });
    expect(res).toBeTruthy();
    const verified = await h.api.verifyEmailOTP({ body: { email, otp: await h.otpFor(email) } });
    expect(verified.status).toBe(true);
    process.env.KZ_ADMIN_EMAILS = "";
  });

  it("设了名单的实例：陌生邮箱不能注册（接口为防探测返回成功，但不建账号、不发信）", async () => {
    process.env.KZ_ALLOWED_EMAILS = "family@example.com";
    const email = h.fresh();
    await h.post("/sign-up/email", { email, password: "owner-pass-11", name: "x" });
    process.env.KZ_ALLOWED_EMAILS = "";
    expect(await h.db.select().from(user).where(eq(user.email, email))).toEqual([]);
    expect(h.logs.some((l) => l.includes(email))).toBe(false);
  });

  it("被拉黑的账号：密码和验证码登录都返回 disabled；解除后恢复", async () => {
    const email = h.fresh();
    await h.api.signUpEmail({ body: { email, password: "owner-pass-11", name: "x" } });
    await h.api.verifyEmailOTP({ body: { email, otp: await h.otpFor(email) } });
    const [u] = await h.db.select().from(user).where(eq(user.email, email));
    h.logs.length = 0;
    await h.api.sendVerificationOTP({ body: { email, type: "forget-password" } });
    await h.api.resetPasswordEmailOTP({ body: { email, otp: await h.otpFor(email), password: "owner-pass-22" } });
    await setDisabled(h.db, u.id, true);

    const byPassword = await h.post("/sign-in/email", { email, password: "owner-pass-22" });
    expect(byPassword.status).toBe(403);
    expect((await byPassword.json()).code).toBe("disabled");

    h.logs.length = 0;
    await h.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const byOtp = await h.post("/sign-in/email-otp", { email, otp: await h.otpFor(email) });
    expect(byOtp.status).toBe(403);
    expect((await byOtp.json()).code).toBe("disabled");

    await setDisabled(h.db, u.id, false);
    expect((await h.post("/sign-in/email", { email, password: "owner-pass-22" })).status).toBe(200);
  });
});

describe.skipIf(!URL)("邮箱注册的每日上限（需要 KZ_TEST_DATABASE_URL）", () => {
  const emails: string[] = [];
  afterAll(async () => {
    const db = createDb(URL!);
    for (const e of emails) await db.delete(user).where(eq(user.email, e));
    await db.$client.end();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("超过上限返回 signup_busy，并且不创建账号", async () => {
    vi.stubEnv("KZ_SIGNUP_DAILY_LIMIT", "1");
    vi.stubEnv("DATABASE_URL", URL!);
    vi.stubEnv("KZ_ALLOWED_EMAILS", "");
    vi.resetModules();
    const { getAuth } = await import("./auth");
    const signUp = () => {
      const email = `cap-${randomId().toLowerCase()}@example.com`;
      emails.push(email);
      return getAuth().handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email, password: "owner-pass-11", name: "x" }),
      }));
    };
    const post = (email: string, password: string) => getAuth().handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify({ email, password, name: "x" }),
    }));
    // 校验不通过的请求不占名额
    expect((await post("not-an-email", "owner-pass-11")).status).toBe(400);
    const weak = `cap-${randomId().toLowerCase()}@example.com`;
    emails.push(weak);
    expect((await post(weak, "x")).status).toBe(400);
    expect((await signUp()).status).toBe(200);
    const blocked = await signUp();
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).code).toBe("signup_busy");
    const db = createDb(URL!);
    expect(await db.select().from(user).where(eq(user.email, emails.at(-1)!))).toEqual([]);
    await db.$client.end();
  });
});
