import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, type DB } from "@/db/client";
import { allowedEmail, user } from "@/db/schema";
import { randomId } from "./crypto";

const URL = process.env.KZ_TEST_DATABASE_URL;

describe.skipIf(!URL)("登录接口的限制（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  let api: Awaited<ReturnType<typeof load>>;
  const logs: string[] = [];
  const emails: string[] = [];
  const fresh = () => { const e = `limits-${randomId().toLowerCase()}@example.com`; emails.push(e); return e; };
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

  const post = async (path: string, body: unknown, ip = "10.99.0.77") => (await import("./auth")).getAuth().handler(new Request(`http://localhost:3000/api/auth${path}`, {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-real-ip": ip }, body: JSON.stringify(body),
  }));

  it("过长的字段在进入限流器之前就拒绝", async () => {
    const res = await post("/sign-in/email", { email: `${"a".repeat(300)}@example.com`, password: "x" }, "10.99.0.20");
    expect(res.status).toBe(400);
    const name = await post("/sign-up/email", { email: fresh(), password: "long-enough-1", name: "n".repeat(101) }, "10.99.0.20");
    expect(name.status).toBe(400);
  });

  it("绕过发信限制的接口已停用", async () => {
    const res = await post("/send-verification-email", { email: fresh() }, "10.99.0.21");
    expect(res.status).toBe(404);
  });

  it("同一邮箱从一个 IP 发验证码到上限后，主人从别的 IP 还能发，手里的验证码也不会被替换", async () => {
    const email = fresh();
    await api.signUpEmail({ body: { email, password: "owner-pass-11", name: "x" } });
    const send = (ip: string) => post("/email-otp/send-verification-otp", { email, type: "email-verification" }, ip);
    for (let i = 0; i < 5; i++) expect((await send("10.99.0.22")).status).toBe(200);
    await vi.waitFor(() => expect(logs.filter((l) => l.includes(email)).length).toBeGreaterThanOrEqual(6));
    const held = await otpFor(email);
    expect((await send("10.99.0.22")).status).toBe(429);
    await api.verifyEmailOTP({ body: { email, otp: held } });
  });

  it("同一 IP 换邮箱发验证码，每天合计有上限", async () => {
    const statuses = [];
    for (let i = 0; i < 21; i++) statuses.push((await post("/email-otp/send-verification-otp", { email: fresh(), type: "sign-in" }, "10.99.0.23")).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
