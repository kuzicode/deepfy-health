import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSnapshot } from "@/core/bundle";
import { latestReadings } from "@/core/analysis";
import { loadVault, readVaultRaw } from "@/core/vault";
import { createDb, type DB } from "@/db/client";
import { doc, member, user } from "@/db/schema";
import { newDek, randomId } from "./crypto";
import { gcOrphanAttachments } from "./attachments";
import { ImportRejected, KeyTaken, NotFound, PgRepository } from "./pg-repository";

const URL = process.env.KZ_TEST_DATABASE_URL;
const SAMPLE = path.resolve(import.meta.dirname, "../../examples/sample-vault/Personal");

describe.skipIf(!URL)("PgRepository（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const kek = newDek();
  const userA = `test-a-${randomId()}`;
  const userB = `test-b-${randomId()}`;
  let a: PgRepository;
  let b: PgRepository;

  beforeAll(async () => {
    db = createDb(URL!);
    for (const id of [userA, userB]) await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
    a = new PgRepository(db, userA, kek);
    b = new PgRepository(db, userB, kek);
    process.env.KZ_ATTACHMENT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kzh-att-"));
  });

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, userA));
    await db.delete(user).where(eq(user.id, userB));
    await db.$client.end();
  });

  it("导入示例 vault 后，云端快照与本地一致", async () => {
    const res = await a.importRaw(readVaultRaw(SAMPLE));
    expect(res.created).toBeGreaterThan(10);
    const local = loadVault(SAMPLE);
    const cloud = await a.snapshot();
    expect(cloud.issues).toEqual([]);
    expect(cloud.members.map((m) => m.id)).toEqual(local.members.map((m) => m.id));
    const kz = (s: typeof local) => latestReadings(s.members[0], s.catalog).map((r) => [r.code, r.value, r.flag]);
    expect(kz(cloud)).toEqual(kz(local));
    expect(cloud.catalog.get("NSE")?.name).toBe("神经元特异性烯醇化酶");
  });

  it("再次导入相同内容全部跳过", async () => {
    const res = await a.importRaw(readVaultRaw(SAMPLE));
    expect(res).toMatchObject({ created: 0, updated: 0, conflicts: [] });
  });

  it("数据库里没有明文", async () => {
    // 只看本用户的数据；ASCII 词带引号（base64 密文里不可能出现引号，避免随机命中「ALT」这类短串）
    const rows = await db.select({ c: doc.ciphertext }).from(doc).innerJoin(member, eq(member.id, doc.memberId)).where(eq(member.userId, userA));
    const names = await db.select({ n: member.nameCipher }).from(member).where(eq(member.userId, userA));
    const all = rows.map((r) => r.c).join("\n") + names.map((r) => r.n).join("\n");
    expect(rows.length).toBeGreaterThan(10);
    for (const word of ["丙氨酸", '"ALT"', "小K", "维生素D3", "1990-05-20", "妈妈"]) expect(all).not.toContain(word);
  });

  it("云端版本更新时不覆盖，force 才覆盖", async () => {
    const raw = readVaultRaw(SAMPLE);
    const profile = raw.docs.kz.find((d) => d.kind === "profile")!;
    profile.body = "云端修改";
    profile.updatedAt = new Date(Date.now() + 60_000).toISOString();
    await a.importRaw(raw);
    profile.body = "本地旧版本";
    profile.updatedAt = new Date(Date.now() - 86_400_000).toISOString();
    expect((await a.importRaw(raw)).conflicts).toEqual(["kz/profile"]);
    expect((await a.importRaw(raw, { force: true })).updated).toBe(1);
    expect((await a.getMember("kz"))?.member.profile?.body).toBe("本地旧版本");
  });

  it("校验有错误时整批拒绝", async () => {
    const raw = readVaultRaw(SAMPLE);
    raw.docs.kz.push({ kind: "record", key: "20260901 坏数据", data: { date: "2026-99-99", type: "lab", title: "x", indicators: [{ code: "ALT", value: 1 }] }, body: "" });
    await expect(a.importRaw(raw)).rejects.toBeInstanceOf(ImportRejected);
    expect(buildSnapshot(await a.exportRaw(), { root: "x" }).members[0].records.some((r) => r.slug.includes("坏数据"))).toBe(false);
  });

  it("用户之间互相隔离", async () => {
    expect((await b.snapshot()).members).toEqual([]);
    expect(await b.getMember("kz")).toBeUndefined();
    await expect(b.getAttachment("kz", "attachments/x.pdf")).rejects.toBeInstanceOf(NotFound);
  });

  it("附件加密落盘，可还原；非法路径被拒绝", async () => {
    const pdf = Buffer.from("%PDF-1.4 体检报告 ALT 61");
    await a.putAttachment("kz", "attachments/report.pdf", pdf, "application/pdf");
    const files = fs.readdirSync(process.env.KZ_ATTACHMENT_DIR!);
    expect(fs.readFileSync(path.join(process.env.KZ_ATTACHMENT_DIR!, files[0]), "utf8")).not.toContain("体检报告");
    expect((await a.getAttachment("kz", "attachments/report.pdf")).data.equals(pdf)).toBe(true);
    await expect(a.putAttachment("kz", "attachments/../../etc/passwd", pdf, "x")).rejects.toThrow("不合法");
    await expect(a.putAttachment("kz", "profile.md", pdf, "x")).rejects.toThrow("不合法");
  });

  it("非法文档名（路径分隔、..）整批拒绝", async () => {
    for (const key of ["../../../../escaped", "a/b", ".hidden", "x\\y"]) {
      const raw = readVaultRaw(SAMPLE);
      raw.docs.kz.push({ kind: "record", key, data: { date: "2026-09-01", type: "lab", title: "x", indicators: [{ code: "ALT", value: 1 }] }, body: "" });
      await expect(a.importRaw(raw)).rejects.toBeInstanceOf(ImportRejected);
    }
  });

  it("附件更新后旧文件延迟清理：48 小时内保留，之后无人引用才删除", async () => {
    const dir = process.env.KZ_ATTACHMENT_DIR!;
    const before = new Set(fs.readdirSync(dir));
    await a.putAttachment("kz", "attachments/report.pdf", Buffer.from("%PDF v2"), "application/pdf");
    expect(fs.readdirSync(dir).filter((f) => !before.has(f))).toHaveLength(1);
    expect([...before].every((f) => fs.existsSync(path.join(dir, f)))).toBe(true);
    expect(await gcOrphanAttachments(db)).toEqual([]);
    const removed = await gcOrphanAttachments(db, 48 * 3600_000, Date.now() + 49 * 3600_000);
    expect(removed.length).toBe(1);
    expect((await a.getAttachment("kz", "attachments/report.pdf")).data.toString()).toBe("%PDF v2");
  });

  it("applyChanges：新建成员、写日志与手动记录、编辑档案、删除日志，不影响其他数据", async () => {
    const c = new PgRepository(db, userB, kek);
    const before = (await c.snapshot()).members.length;
    await c.applyChanges([{ op: "add_member", id: "m-quick1", name: "小测", profile: { id: "m-quick1", name: "小测", sex: "female", birth_date: "1990-01-15" } }]);
    await c.applyChanges([
      { op: "put", member: "m-quick1", kind: "log", key: "20261103-0930", data: { date: "2026-11-03", time: "09:30", title: "头晕", tags: ["头晕"] }, body: "起身时" },
      { op: "put", member: "m-quick1", kind: "record", key: "20261103 日常记录", data: { date: "2026-11-03", type: "manual", title: "日常记录", indicators: [{ code: "SBP", value: 135, unit: "mmHg" }] }, body: "" },
    ]);
    let m = (await c.getMember("m-quick1"))!.member;
    expect(m.logs.map((l) => l.title)).toEqual(["头晕"]);
    expect(m.records[0].indicators[0]).toMatchObject({ code: "SBP", value: 135 });
    expect((await c.snapshot()).members.length).toBe(before + 1);

    await expect(c.applyChanges([{ op: "put", member: "m-quick1", kind: "log", key: "20261103-0931", data: { date: "2026-11-03" }, body: "" }]))
      .rejects.toBeInstanceOf(ImportRejected); // 缺 title
    await expect(c.applyChanges([{ op: "put", member: "m-quick1", kind: "log", key: "../x", data: { date: "2026-11-03", title: "x" }, body: "" }]))
      .rejects.toBeInstanceOf(ImportRejected);
    await expect(c.applyChanges([{ op: "add_member", id: "m-quick1", name: "重复", profile: {} }])).rejects.toBeInstanceOf(ImportRejected);

    await c.applyChanges([{ op: "delete", member: "m-quick1", kind: "log", key: "20261103-0930" }]);
    m = (await c.getMember("m-quick1"))!.member;
    expect(m.logs).toEqual([]);
    expect(m.profile?.birth_date).toBe("1990-01-15");
  });

  it("applyChanges：create 不覆盖已有 key（并发写入），删除日志只删除无人引用的附件", async () => {
    const c = new PgRepository(db, userB, kek);
    const log = (title: string, attachments: string[] = []) => ({ date: "2026-11-03", time: "10:00", title, attachments });
    await c.applyChanges([{ op: "create", member: "m-quick1", kind: "log", key: "20261103-1000", data: log("第一条"), body: "" }]);
    await expect(c.applyChanges([{ op: "create", member: "m-quick1", kind: "log", key: "20261103-1000", data: log("第二条"), body: "" }]))
      .rejects.toBeInstanceOf(KeyTaken);
    // 两个请求同时拿到相同 key：只有一个成功，另一个 KeyTaken，内容不被覆盖
    const race = await Promise.allSettled(["甲", "乙"].map((t) =>
      c.applyChanges([{ op: "create", member: "m-quick1", kind: "log", key: "20261103-1001", data: { ...log(t), time: "10:01" }, body: "" }])));
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(race.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(KeyTaken) });
    expect((await c.getMember("m-quick1"))!.member.logs.find((l) => l.time === "10:00")?.title).toBe("第一条");

    const shared = "attachments/logs/shared.jpg";
    await c.putAttachment("m-quick1", shared, Buffer.from([0xff, 0xd8, 0xff, 1]), "image/jpeg");
    await c.applyChanges([
      { op: "put", member: "m-quick1", kind: "log", key: "20261103-1100", data: { ...log("A", [shared]), time: "11:00" }, body: "" },
      { op: "put", member: "m-quick1", kind: "log", key: "20261103-1101", data: { ...log("B", [shared]), time: "11:01" }, body: "" },
    ]);
    await c.applyChanges([{ op: "delete", member: "m-quick1", kind: "log", key: "20261103-1100" }]);
    expect((await c.getAttachment("m-quick1", shared)).mime).toBe("image/jpeg");
    await c.applyChanges([{ op: "delete", member: "m-quick1", kind: "log", key: "20261103-1101" }]);
    await expect(c.getAttachment("m-quick1", shared)).rejects.toBeInstanceOf(NotFound);
  });

  it("改称呼：成员名与档案 name 一起更新，仍加密；越界长度与不存在的成员被拒", async () => {
    const c = new PgRepository(db, userB, kek);
    await c.renameMember("m-quick1", "  新称呼 ");
    const m = (await c.getMember("m-quick1"))!.member;
    expect(m.name).toBe("新称呼");
    expect(m.profile?.name).toBe("新称呼");
    const [row] = await db.select({ n: member.nameCipher }).from(member).where(eq(member.slug, "m-quick1"));
    expect(row.n).not.toContain("新称呼");
    await expect(c.renameMember("m-quick1", "")).rejects.toBeInstanceOf(ImportRejected);
    await expect(c.renameMember("m-quick1", "x".repeat(41))).rejects.toBeInstanceOf(ImportRejected);
    await expect(c.renameMember("nobody", "x")).rejects.toBeInstanceOf(NotFound);
    // 读取时不允许的字符必须在写入时就拒绝，否则账号会整体打不开
    for (const bad of ["小K #2", "妈妈[继母]", "a|b", "两\n行"]) await expect(c.renameMember("m-quick1", bad)).rejects.toBeInstanceOf(ImportRejected);
    expect((await c.snapshot()).members.find((x) => x.id === "m-quick1")?.name).toBe("新称呼");
  });

  it("换主密钥无法解密", async () => {
    await expect(new PgRepository(db, userA, newDek()).snapshot()).rejects.toThrow();
  });
});
