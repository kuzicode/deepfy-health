import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DB } from "@/db/client";
import { account, user } from "@/db/schema";
import { randomId } from "./crypto";
import { createLimiter, lookupEmail } from "./login-lookup";

describe("createLimiter", () => {
  it("窗口内超过次数就拦截，窗口过后恢复", () => {
    const allow = createLimiter(2, 1000);
    expect([allow("ip", 0), allow("ip", 10), allow("ip", 20)]).toEqual([true, true, false]);
    expect(allow("other", 20)).toBe(true);
    expect(allow("ip", 1015)).toBe(true);
  });
});

const URL = process.env.KZ_TEST_DATABASE_URL;
const ENV = { allowed: process.env.KZ_ALLOWED_EMAILS, admins: process.env.KZ_ADMIN_EMAILS };

describe.skipIf(!URL)("lookupEmail（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const pw = `lk-pw-${randomId()}`;
  const gg = `lk-gg-${randomId()}`;

  beforeAll(async () => {
    db = createDb(URL!);
    await db.insert(user).values([{ id: pw, name: "pw", email: `${pw}@example.com` }, { id: gg, name: "gg", email: `${gg}@example.com` }]);
    await db.insert(account).values([
      { id: `a-${pw}`, accountId: pw, providerId: "credential", userId: pw, password: "hash" },
      { id: `a-${gg}`, accountId: "google-sub", providerId: "google", userId: gg },
    ]);
  });
  afterEach(() => {
    process.env.KZ_ALLOWED_EMAILS = ENV.allowed ?? "";
    process.env.KZ_ADMIN_EMAILS = ENV.admins ?? "";
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, pw));
    await db.delete(user).where(eq(user.id, gg));
    await db.$client.end();
  });

  it("有密码 → password；只有 Google → otp；大小写不敏感", async () => {
    expect(await lookupEmail(db, `${pw}@example.com`)).toBe("password");
    expect(await lookupEmail(db, `  ${gg}@EXAMPLE.com `)).toBe("otp");
  });

  it("未注册：在名单内 → create，不在 → closed", async () => {
    process.env.KZ_ADMIN_EMAILS = "boss@example.com";
    process.env.KZ_ALLOWED_EMAILS = "new@example.com";
    expect(await lookupEmail(db, "New@Example.com")).toBe("create");
    expect(await lookupEmail(db, "stranger@example.com")).toBe("closed");
  });
});
