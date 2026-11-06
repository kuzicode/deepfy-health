import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DB } from "@/db/client";
import { user } from "@/db/schema";
import { randomId } from "./crypto";
import { storedLocale, syncUserLocale } from "./user-locale";

const URL = process.env.KZ_TEST_DATABASE_URL;

describe.skipIf(!URL)("账号语言同步（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const uid = `loc-${randomId()}`;

  beforeAll(async () => {
    db = createDb(URL!);
    await db.insert(user).values({ id: uid, name: "loc", email: `${uid}@example.com` });
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, uid));
    await db.$client.end();
  });

  it("没记录时写入，语言没变不写，切换后更新；不存在的账号不报错", async () => {
    expect(await storedLocale(db, uid)).toBeUndefined();
    expect(await syncUserLocale(db, uid, "en")).toBe(true);
    expect(await storedLocale(db, uid)).toBe("en");
    expect(await syncUserLocale(db, uid, "en")).toBe(false);
    expect(await syncUserLocale(db, uid, "zh")).toBe(true);
    expect(await storedLocale(db, uid)).toBe("zh");
    expect(await syncUserLocale(db, "nobody", "en")).toBe(false);
    expect(await storedLocale(db, "nobody")).toBeUndefined();
  });
});
