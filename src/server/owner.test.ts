import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, type DB } from "@/db/client";
import { opsState, user } from "@/db/schema";
import { disableTarget, isAdmin, OWNER_KEY, registrationRestricted } from "./access";
import { randomId } from "./crypto";

const URL = process.env.KZ_TEST_DATABASE_URL;

describe.skipIf(!URL)("自托管版的所有者（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const id = `own-${randomId()}`;
  const other = `oth-${randomId()}`;
  const owner = { id, email: `${id}@example.com`, emailVerified: true };

  beforeAll(async () => {
    db = createDb(URL!);
    await db.insert(user).values([{ ...owner, name: "owner" }, { id: other, name: "other", email: `${other}@example.com`, emailVerified: true }]);
    await db.insert(opsState).values({ key: OWNER_KEY, value: { userId: id } });
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await db.delete(opsState).where(eq(opsState.key, OWNER_KEY));
    await db.delete(user).where(eq(user.id, id));
    await db.delete(user).where(eq(user.id, other));
    await db.$client.end();
  });

  it("自托管版：所有者是管理员、不能被停用，也没有白名单", async () => {
    vi.stubEnv("KZ_EDITION", "self");
    vi.stubEnv("KZ_ALLOWED_EMAILS", "family@example.com");
    expect(registrationRestricted()).toBe(false);
    expect(await isAdmin(db, owner)).toBe(true);
    expect(await isAdmin(db, { ...owner, emailVerified: false })).toBe(false);
    expect(await isAdmin(db, { id: other, email: `${other}@example.com`, emailVerified: true })).toBe(false);
    expect(await disableTarget(db, other, id)).toBeUndefined();
    expect((await disableTarget(db, id, other))?.id).toBe(other);
  });

  it("官方版不认所有者", async () => {
    vi.stubEnv("KZ_EDITION", "hosted");
    expect(await isAdmin(db, owner)).toBe(false);
  });
});
