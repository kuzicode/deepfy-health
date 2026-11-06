import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readVaultRaw } from "@/core/vault";
import { createDb, type DB } from "@/db/client";
import { accountPlan, agentChange, attachment, doc, member, user } from "@/db/schema";
import { newDek, randomId } from "./crypto";
import { PgRepository } from "./pg-repository";
import { PLANS, QuotaExceeded, consumeUpload, isUnlimited, limitsOf, lockUser, planOf, usageOf } from "./quota";
import { createToken } from "./tokens";

describe("额度定义", () => {
  it("付费档每项都不低于免费档", () => {
    for (const k of Object.keys(PLANS.free) as (keyof typeof PLANS.free)[]) {
      expect(PLANS.pro[k]).toBeGreaterThanOrEqual(PLANS.free[k]);
      expect(isUnlimited(PLANS.admin[k])).toBe(true);
    }
  });
});

const URL = process.env.KZ_TEST_DATABASE_URL;

describe.skipIf(!URL)("资源额度（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const uid = `quota-res-${randomId()}`;
  const kek = newDek();
  const SAMPLE = path.resolve(import.meta.dirname, "../../examples/sample-vault/Personal");
  const free = PLANS.free as unknown as Record<string, number>;
  const withLimit = async (key: string, value: number, fn: () => Promise<void>) => {
    const was = free[key];
    free[key] = value;
    try { await fn(); } finally { free[key] = was; }
  };

  beforeAll(async () => {
    process.env.KZ_ATTACHMENT_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), "kzh-att-"));
    db = createDb(URL!);
    await db.insert(user).values({ id: uid, name: uid, email: `${uid}@example.com` });
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, uid));
    await db.$client.end();
  });

  const docCount = async () => {
    const ids = (await db.select({ id: member.id }).from(member).where(eq(member.userId, uid))).map((m) => m.id);
    return ids.length ? (await db.select({ id: doc.id }).from(doc).where(inArray(doc.memberId, ids))).length : 0;
  };

  it("导入超过文档条数或总量时整批回滚", async () => {
    const repo = new PgRepository(db, uid, kek);
    const raw = readVaultRaw(SAMPLE);
    await withLimit("docs", 1, async () => {
      await expect(repo.importRaw(raw)).rejects.toMatchObject({ resource: "docs" });
    });
    await withLimit("docBytes", 1, async () => {
      await expect(repo.importRaw(raw)).rejects.toMatchObject({ resource: "docBytes" });
    });
    expect(await docCount()).toBe(0);
    await repo.importRaw(raw);
    expect(await docCount()).toBeGreaterThan(1);
    expect((await usageOf(db, uid)).docBytes).toBeGreaterThan(0);
  });

  it("单点修改超过总量时也回滚", async () => {
    const repo = new PgRepository(db, uid, kek);
    const before = await docCount();
    const change = { op: "add_member", id: "m-over", name: "over", profile: { id: "m-over", name: "over", sex: "female", birth_date: "1970-01-01" } } as const;
    await withLimit("docs", before, async () => {
      await expect(repo.applyChanges([change])).rejects.toMatchObject({ resource: "docs" });
    });
    expect(await docCount()).toBe(before);
  });

  it("等账号写锁超时后失败，不会一直占着数据库连接", async () => {
    await db.transaction(async (holder) => {
      await lockUser(holder, uid);
      const other = createDb(URL!);
      try {
        await expect(other.transaction((tx) => lockUser(tx, uid))).rejects.toThrow();
      } finally {
        await other.$client.end();
      }
    });
  }, 20_000);

  it("附件数量到上限后不能新增，但可以覆盖已有的", async () => {
    const repo = new PgRepository(db, uid, kek);
    const [{ slug }] = await db.select({ slug: member.slug }).from(member).where(eq(member.userId, uid));
    await repo.putAttachment(slug, "attachments/one.pdf", Buffer.from("v1"), "application/pdf");
    await withLimit("attachmentCount", 1, async () => {
      await expect(repo.putAttachment(slug, "attachments/empty.pdf", Buffer.alloc(0), "application/pdf")).rejects.toMatchObject({ resource: "attachmentCount" });
      await repo.putAttachment(slug, "attachments/one.pdf", Buffer.from("v2"), "application/pdf");
    });
    expect((await usageOf(db, uid)).attachmentCount).toBe(1);
  });

  it("反复覆盖同一路径也会用完每天的上传量", async () => {
    const repo = new PgRepository(db, uid, kek);
    const [{ slug }] = await db.select({ slug: member.slug }).from(member).where(eq(member.userId, uid));
    await consumeUpload(db, uid, PLANS.free.uploadBytesPerDay - 10); // 前面的用例已上传 4 字节，还剩 6 字节
    await expect(repo.putAttachment(slug, "attachments/one.pdf", Buffer.from("too big"), "application/pdf")).rejects.toMatchObject({ resource: "uploadBytesPerDay" });
    await expect(consumeUpload(db, uid, 7)).rejects.toBeInstanceOf(QuotaExceeded);
    await repo.putAttachment(slug, "attachments/one.pdf", Buffer.from("v3"), "application/pdf");
  });
});

describe.skipIf(!URL)("额度检查（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  let repo: PgRepository;
  const uid = `quota-${randomId()}`;
  const kek = newDek();
  const profile = (id: string) => ({ id, name: id, sex: "female", birth_date: "1970-01-01" });
  const addMember = (id: string) => repo.applyChanges([{ op: "add_member", id, name: id, profile: profile(id) }]);

  beforeAll(async () => {
    db = createDb(URL!);
    await db.insert(user).values({ id: uid, name: uid, email: `${uid}@example.com` });
    repo = new PgRepository(db, uid, kek);
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, uid));
    await db.$client.end();
  });

  it("没有档位记录 = free；改成 pro 后额度放宽", async () => {
    expect(await planOf(db, uid)).toBe("free");
    await db.insert(accountPlan).values({ userId: uid, plan: "pro" });
    expect(await planOf(db, uid)).toBe("pro");
    await db.delete(accountPlan).where(eq(accountPlan.userId, uid));
  });

  it("管理员邮箱 = admin 档，不受额度限制", async () => {
    const prev = process.env.KZ_ADMIN_EMAILS;
    process.env.KZ_ADMIN_EMAILS = `${uid}@EXAMPLE.com`;
    try {
      expect(await planOf(db, uid)).toBe("admin");
      expect(isUnlimited((await limitsOf(db, uid)).tokens)).toBe(true);
    } finally {
      process.env.KZ_ADMIN_EMAILS = prev;
    }
    expect(await planOf(db, uid)).toBe("free");
  });

  it("token：并发创建 6 个只成功 3 个（额度检查与写入在同一把锁内，Codex review）", async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => createToken(db, uid, `t${i}`)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(PLANS.free.tokens);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof QuotaExceeded)).toBe(true);
    expect((await usageOf(db, uid)).tokens).toBe(PLANS.free.tokens);
  });

  it("家人：第 7 位被拒，且没有写入", async () => {
    for (let i = 0; i < PLANS.free.members; i++) await addMember(`m${i}`);
    await expect(addMember("m-extra")).rejects.toBeInstanceOf(QuotaExceeded);
    expect((await usageOf(db, uid)).members).toBe(PLANS.free.members);
  });

  it("附件：超过总量被拒；同一路径替换只算差额", async () => {
    await repo.putAttachment("m0", "attachments/a.jpg", Buffer.alloc(1024, 1), "image/jpeg");
    // 模拟已经用到只剩 1 KB：直接插一条大附件记录（不写真文件）
    const [m0] = await db.select({ id: member.id }).from(member).where(and(eq(member.userId, uid), eq(member.slug, "m0")));
    const filler = PLANS.free.attachmentBytes - 1024 - 1024;
    await db.insert(attachment).values({ id: randomId(), memberId: m0.id, relPath: "attachments/filler.pdf", mime: "application/pdf", size: filler, sha256: "x", storageKey: "missing" });
    await expect(repo.putAttachment("m0", "attachments/b.jpg", Buffer.alloc(2048, 3), "image/jpeg")).rejects.toBeInstanceOf(QuotaExceeded);
    // 同一路径替换只算差额：1 KB → 2 KB 正好用满，不超
    await repo.putAttachment("m0", "attachments/a.jpg", Buffer.alloc(2048, 2), "image/jpeg");
    expect((await usageOf(db, uid)).attachmentBytes).toBe(PLANS.free.attachmentBytes);
    // 并发上传（Codex review）：腾出 1 KB 后同时传两个 1 KB 文件，只能成功一个
    await db.update(attachment).set({ size: filler - 1024 }).where(eq(attachment.relPath, "attachments/filler.pdf"));
    const race = await Promise.allSettled(["e", "f"].map((n) => repo.putAttachment("m0", `attachments/${n}.jpg`, Buffer.alloc(1024, n.charCodeAt(0)), "image/jpeg")));
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await usageOf(db, uid)).attachmentBytes).toBe(PLANS.free.attachmentBytes);
    await db.delete(attachment).where(eq(attachment.relPath, "attachments/filler.pdf"));
  });

  it("agent 写入：按实际修改记录条数扣，满 200 条后拒绝；网页写入不受影响", async () => {
    const [m0] = await db.select({ id: member.id }).from(member).where(and(eq(member.userId, uid), eq(member.slug, "m0")));
    const rows = Array.from({ length: PLANS.free.mcpWritesPerDay - 1 }, () => ({
      id: randomId(), userId: uid, memberId: m0.id, tokenId: "t", tokenName: "t", tool: "add_log", kind: "log", key: randomId(), newSha256: "x",
    }));
    await db.insert(agentChange).values(rows);
    const audit = { tokenId: "t", tokenName: "t", tool: "add_log" };
    // 还剩 1 条额度：一次改 2 个文档要整体拒绝，什么都不写（Codex review：按实际修改记录条数扣）
    const two = ["n1", "n2"].map((key) => ({ op: "create" as const, member: "m0", kind: "log" as const, key: `20261104-${key}`, data: { date: "2026-11-04", type: "note", title: key }, body: "" }));
    await expect(repo.applyChanges(two, { audit })).rejects.toBeInstanceOf(QuotaExceeded);
    expect((await usageOf(db, uid)).mcpWritesPerDay).toBe(PLANS.free.mcpWritesPerDay - 1);
    await repo.addLog("m0", { date: "2026-11-04", type: "note", title: "最后一条" }, "", { audit });
    await expect(repo.addLog("m0", { date: "2026-11-04", type: "note", title: "x" }, "", { audit })).rejects.toBeInstanceOf(QuotaExceeded);
    await expect(repo.addLog("m0", { date: "2026-11-04", type: "note", title: "网页写入" }, "")).resolves.toBeTruthy();
  });
});
