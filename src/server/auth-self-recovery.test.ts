import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type DB } from "@/db/client";
import { opsState, user } from "@/db/schema";
import { OWNER_KEY, ownerId } from "./access";

const URL = process.env.KZ_TEST_DATABASE_URL;
const GOOD_KEY = Buffer.alloc(32, 7).toString("base64");
const owner = { name: "Owner", email: "owner@example.com", password: "owner-pass-1" };
const hook = vi.hoisted(() => ({ failNext: false, user: { id: "", email: "" } }));

vi.mock("./pg-repository", async (actual) => ({
  ...(await actual<typeof import("./pg-repository")>()),
  ensureUserKey: async (...args: Parameters<typeof import("./pg-repository").ensureUserKey>) => {
    if (hook.failNext) { hook.failNext = false; throw new Error("key failed"); }
    return (await actual<typeof import("./pg-repository")>()).ensureUserKey(...args);
  },
}));
vi.mock("@/server/session", () => ({ requireUser: async () => hook.user, userRepository: async () => ({ purgeAttachmentFiles: async () => {} }) }));

const api = async () => (await import("./auth")).getAuth().api;

// 这个文件清空测试库的账号：首次设置要求一个账号都没有（数据库测试按文件串行）
describe.skipIf(!URL)("自托管版首次设置失败后能重试，所有者不能自删（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const reset = async () => {
    await db.delete(opsState).where(eq(opsState.key, OWNER_KEY));
    await db.delete(user);
  };

  beforeAll(() => { db = createDb(URL!); });
  beforeEach(async () => {
    for (const [k, v] of [["KZ_EDITION", "self"], ["DATABASE_URL", URL!], ["BETTER_AUTH_URL", ""], ["KZ_ADMIN_EMAILS", ""], ["KZ_MASTER_KEY", GOOD_KEY], ["BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1"]]) vi.stubEnv(k, v);
    await reset();
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await reset();
    await db.$client.end();
  });

  const expectCleanThenRetry = async () => {
    expect(await db.query.user.findFirst()).toBeUndefined();
    expect(await db.query.opsState.findFirst({ where: eq(opsState.key, OWNER_KEY) })).toBeUndefined();
    await (await api()).kzSetupOwner({ body: owner });
    const created = await db.query.user.findFirst({ where: eq(user.email, owner.email) });
    expect(await ownerId(db)).toBe(created!.id);
  };

  it("主密钥无效时什么都不留下，修好后可以重试", async () => {
    vi.stubEnv("KZ_MASTER_KEY", "not-a-valid-key");
    await expect((await api()).kzSetupOwner({ body: owner })).rejects.toThrow();
    vi.stubEnv("KZ_MASTER_KEY", GOOD_KEY);
    await expectCleanThenRetry();
  });

  it("建号中途失败时撤掉这个账号，可以重试", async () => {
    hook.failNext = true;
    await expect((await api()).kzSetupOwner({ body: owner })).rejects.toThrow();
    await expectCleanThenRetry();
  });

  it("所有者不能在设置页删除自己", async () => {
    const { deleteAccountAction } = await import("../../app/(app)/settings/actions");
    await expectCleanThenRetry();
    const row = (await db.query.user.findFirst({ where: eq(user.email, owner.email) }))!;
    const form = new FormData();
    form.set("confirm", owner.email);
    hook.user = { id: row.id, email: row.email };
    expect(await deleteAccountAction({}, form)).toEqual({ error: "owner" });
    expect(await db.query.user.findFirst({ where: eq(user.id, row.id) })).toBeDefined();
  });
});
