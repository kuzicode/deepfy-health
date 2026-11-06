import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, type DB } from "@/db/client";
import { allowedEmail, waitlist } from "@/db/schema";
import { isEmailAllowed } from "./access";
import { randomId } from "./crypto";
import { lookupEmail } from "./login-lookup";
import { applyForAccess, approvedRequest, decide, deliverInvite, joinWaitlist, listWaitlist, waitlistStats } from "./waitlist";

const URL = process.env.KZ_TEST_DATABASE_URL;
const ENV = { allowed: process.env.KZ_ALLOWED_EMAILS, admins: process.env.KZ_ADMIN_EMAILS };

describe("deliverInvite", () => {
  const row = { email: "a@example.com", locale: "en" };

  it("如实返回发送结果，按申请语言发送", async () => {
    const sent: unknown[][] = [];
    expect(await deliverInvite(row, async (...args) => { sent.push(args); return true; })).toBe(true);
    expect(sent).toEqual([["a@example.com", "en"]]);
    expect(await deliverInvite(row, async () => false)).toBe(false);
  });

  it("发信抛错时返回失败，不让审批报错", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await deliverInvite(row, async () => { throw new Error("network"); })).toBe(false);
    vi.restoreAllMocks();
  });
});

describe.skipIf(!URL)("早鸟申请（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const id = randomId().slice(0, 8);
  const a = `wl-a-${id}@example.com`;
  const b = `wl-b-${id}@example.com`;

  beforeAll(() => {
    db = createDb(URL!);
  });
  afterEach(() => {
    process.env.KZ_ALLOWED_EMAILS = ENV.allowed ?? "";
    process.env.KZ_ADMIN_EMAILS = ENV.admins ?? "";
  });
  afterAll(async () => {
    await db.delete(waitlist).where(inArray(waitlist.email, [a, b]));
    await db.delete(allowedEmail).where(inArray(allowedEmail.email, [a, b]));
    await db.$client.end();
  });

  it("申请入口：未开通的进候补；已开通的不进候补，返回下一步", async () => {
    process.env.KZ_ADMIN_EMAILS = "boss@example.com";
    const open = `wl-open-${id}@example.com`;
    const closed = `wl-closed-${id}@example.com`;
    process.env.KZ_ALLOWED_EMAILS = open;
    try {
      expect(await applyForAccess(db, { email: open })).toBe("create");
      expect(await db.select().from(waitlist).where(eq(waitlist.email, open))).toEqual([]);
      expect(await applyForAccess(db, { email: closed })).toBe("closed");
      expect((await db.select().from(waitlist).where(eq(waitlist.email, closed)))[0]).toMatchObject({ status: "pending" });
    } finally {
      await db.delete(waitlist).where(eq(waitlist.email, closed));
    }
  });

  it("申请写入待审批；重复申请只更新填写内容，不改审批状态", async () => {
    await joinWaitlist(db, { email: a.toUpperCase(), agents: ["codex", "codex", "claude-code"], note: " 记录体检 " });
    let row = (await listWaitlist(db)).find((r) => r.email === a)!;
    expect(row).toMatchObject({ status: "pending", agents: ["codex", "claude-code"], note: "记录体检" });
    await decide(db, a, false, "boss@example.com");
    await joinWaitlist(db, { email: a, agents: ["grokbot"] });
    row = (await db.select().from(waitlist).where(eq(waitlist.email, a)))[0];
    expect(row).toMatchObject({ status: "declined", agents: ["grokbot"] });
  });

  it("拒绝不加入名单；通过后加入名单，登录分流从 closed 变为 create", async () => {
    process.env.KZ_ADMIN_EMAILS = "boss@example.com";
    process.env.KZ_ALLOWED_EMAILS = "seed@example.com";
    await joinWaitlist(db, { email: b, agents: ["workbuddy"] });
    expect(await approvedRequest(db, b)).toBeUndefined();
    expect(await lookupEmail(db, b)).toBe("closed");
    expect(await decide(db, b, false, "boss@example.com")).toBeUndefined();
    expect(await isEmailAllowed(db, b)).toBe(false);
    const row = await decide(db, b, true, "boss@example.com");
    expect(row?.status).toBe("approved");
    expect((await approvedRequest(db, b.toUpperCase()))?.email).toBe(b);
    expect(await isEmailAllowed(db, b)).toBe(true);
    expect(await lookupEmail(db, b)).toBe("create");
  });

  it("统计包含状态计数与 agent 分布", async () => {
    const s = await waitlistStats(db);
    expect(s.total).toBeGreaterThanOrEqual(2);
    expect(s.week).toBeGreaterThanOrEqual(2);
    expect(s.agents.find((x) => x.agent === "workbuddy")?.n).toBeGreaterThanOrEqual(1);
  });

  it("不存在的申请审批返回 undefined", async () => {
    expect(await decide(db, `nobody-${id}@example.com`, true, "boss@example.com")).toBeUndefined();
  });
});
