import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readVaultRaw } from "@/core/vault";
import { createDb, type DB } from "@/db/client";
import { user } from "@/db/schema";
import { newDek, randomId } from "@/server/crypto";
import { PgRepository, RevertConflict } from "@/server/pg-repository";
import { createMcpServer } from "./server";

const URL = process.env.KZ_TEST_DATABASE_URL;
const SAMPLE = path.resolve(import.meta.dirname, "../../examples/sample-vault/Personal");
const TODAY = "2026-11-03";

async function connect(repo: PgRepository, write: boolean) {
  const server = createMcpServer(repo, TODAY, write ? { writer: repo, audit: { tokenId: "tok-1", tokenName: "grokbot" }, appUrl: "https://app.example" } : undefined);
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { text: string }[])[0].text;
    return { isError: !!res.isError, text, json: res.isError ? undefined : JSON.parse(text) };
  };
  return { client, call };
}

let db: DB;
let repo: PgRepository;
const uid = `mcpw-${randomId()}`;

beforeAll(async () => {
  if (!URL) return;
  db = createDb(URL);
  await db.insert(user).values({ id: uid, name: uid, email: `${uid}@example.com` });
  repo = new PgRepository(db, uid, newDek());
  await repo.importRaw(readVaultRaw(SAMPLE));
});
afterAll(async () => {
  if (!URL) return;
  await db.delete(user).where(eq(user.id, uid));
  await db.$client.end();
});

describe.skipIf(!URL)("MCP 写入工具（需要 KZ_TEST_DATABASE_URL）", () => {
  it("只读 token 看不到写入工具；可写入 token 有 9 个写入工具且不标只读", async () => {
    const ro = await connect(repo, false);
    expect((await ro.client.listTools()).tools.some((t) => t.name.startsWith("add_"))).toBe(false);
    const rw = await connect(repo, true);
    const writes = (await rw.client.listTools()).tools.filter((t) => t.annotations?.readOnlyHint === false).map((t) => t.name).sort();
    expect(writes).toEqual(["add_log", "add_measurements", "add_record", "save_indicator_note", "save_regimen_item", "stop_regimen_item", "update_care_plan", "update_profile", "update_schedule"]);
  });

  it("记录症状、更新诊断、记血压、写分析与方案，同一请求里读工具能看到新数据", async () => {
    const { call } = await connect(repo, true);
    const before = (await call("get_overview", { member: "kz" })).json.profile.conditions as string[];

    const log = await call("add_log", { member: "kz", title: "饭后右上腹胀", time: "14:00", severity: 1, tags: ["腹胀"] });
    expect(log.json).toMatchObject({ ok: true, saved: "log 20261103-1400" });
    expect(log.json.undo).toContain("https://app.example/agents");

    const prof = (await call("update_profile", { member: "kz", conditions: [...before, "轻度脂肪肝"], habits: { alcohol: "每周 2 次应酬" } })).json;
    expect(prof.follow_up.conditions[0]).toMatchObject({ condition: "轻度脂肪肝", focus_codes: expect.arrayContaining(["ALT", "TG"]) });
    expect(prof.follow_up.ask_user.join(" ")).toContain("add_record");
    expect(prof.follow_up.then).toContain("update_care_plan");
    const ov = (await call("get_overview", { member: "kz" })).json;
    const fl = ov.conditions.find((c: { condition: string }) => c.condition === "轻度脂肪肝");
    expect(fl.related_checks.map((x: { item: string }) => x.item)).toEqual(expect.arrayContaining(["liver", "ultrasound"])); // 示例成员已有含 ALT 的调养方案
    expect(ov.profile.conditions).toEqual([...before, "轻度脂肪肝"]);
    expect(ov.profile.habits.alcohol).toBe("每周 2 次应酬");
    expect(ov.profile.habits.sleep).toBeDefined(); // 未传的子项保留
    expect(ov.recent_logs[0].title).toBe("饭后右上腹胀");

    await call("add_measurements", { member: "kz", systolic: 138, diastolic: 88 });
    expect((await call("get_indicator", { member: "kz", code: "SBP" })).json.latest).toMatchObject({ value: 138, date: TODAY });

    await call("save_indicator_note", { member: "kz", code: "ALT", status: "watch", summary: "轻度升高，与脂肪肝相关", text: "## 分析\n控制体重与饮酒。", recheck: "2027-02-01" });
    expect((await call("get_indicator", { member: "kz", code: "ALT" })).json.note).toMatchObject({ status: "watch", recheck: "2027-02-01" });
    await call("update_care_plan", { member: "kz", focus: ["ALT", "TG"], text: "# 脂肪肝管理\n- 每周 150 分钟运动" });
    const after = (await call("get_overview", { member: "kz" })).json;
    expect(after.care_plan.focus).toEqual(["ALT", "TG"]);
    expect(after.conditions.find((c: { condition: string }) => c.condition === "轻度脂肪肝").has_care_plan).toBe(true);
    // 只改习惯、不加新病情时不返回 follow_up
    expect((await call("update_profile", { member: "mom", habits: { sleep: "23:30 前" } })).json.follow_up).toBeUndefined();
  });

  it("导入报告：默认只预览不写入；确认后写入；重复导入需 replace", async () => {
    const { call } = await connect(repo, true);
    const report = { member: "kz", date: "2026-10-30", type: "lab", title: "肝功能复查", institution: "社区医院",
      indicators: [{ code: "ALT", value: 62, unit: "U/L", ref_low: 9, ref_high: 50 }, { code: "NOT_A_CODE", value: 1 }] };
    const preview = (await call("add_record", report)).json;
    expect(preview).toMatchObject({ dry_run: true, record: "20261030 肝功能复查", exists: false, unknown_codes: ["NOT_A_CODE"] });
    expect(preview.abnormal).toEqual(["ALT 62 (H)"]);
    expect((await call("list_records", { member: "kz", from: "2026-10-30", to: "2026-10-30" })).json).toEqual([]);

    expect(preview.next).toContain("NOT_A_CODE");
    expect((await call("add_record", { ...report, dry_run: false })).text).toContain("lookup_indicator");
    report.indicators = report.indicators.slice(0, 1);
    expect((await call("add_record", { ...report, dry_run: false })).json.ok).toBe(true);
    expect((await call("get_record", { member: "kz", record: "20261030 肝功能复查" })).json.indicators[0]).toMatchObject({ code: "ALT", flag: "H" });
    const again = await call("add_record", { ...report, dry_run: false });
    expect(again.isError).toBe(true);
    expect(again.text).toContain("replace=true");
  });

  it("日程：新报告含待复查指标时提示确认；update_schedule 标记已检查 / 改日期；日期校验", async () => {
    await repo.applyChanges([{ op: "put", member: "kz", kind: "note", key: "TC", data: { code: "TC", updated: "2026-01-01", status: "watch", summary: "总胆固醇偏高", recheck: "2026-12-01" }, body: "" }]);
    const { call } = await connect(repo, true);
    const saved = (await call("add_record", { member: "kz", date: "2026-10-29", type: "lab", title: "血脂复查", indicators: [{ code: "TC", value: 5.1, unit: "mmol/L" }], dry_run: false })).json;
    expect(saved.scheduled_rechecks_in_report).toEqual(["TC"]);
    expect(saved.follow_up.join(" ")).toContain("update_schedule");
    const item = () => (call("get_overview", { member: "kz" })).then((r) => r.json.schedule.find((x: { codes: string[] }) => x.codes.includes("TC")));
    expect(await item()).toMatchObject({ kind: "recheck", due: "2026-12-01", new_result: "2026-10-29" });

    expect((await call("update_schedule", { member: "kz", kind: "recheck", codes: ["TC"], action: "reschedule", date: "2027-03-01" })).json.ok).toBe(true);
    expect(await item()).toMatchObject({ due: "2027-03-01" });
    expect((await call("update_schedule", { member: "kz", kind: "recheck", codes: ["TC"], action: "done" })).json.ok).toBe(true);
    expect(await item()).toBeUndefined();
    expect((await call("get_indicator", { member: "kz", code: "TC" })).json.note).toMatchObject({ rechecked: TODAY });

    // 体检日期用 mom，避免影响后面对 kz 档案的还原测试
    expect((await call("update_schedule", { member: "mom", kind: "checkup", action: "reschedule", date: "2027-05-20" })).json.ok).toBe(true);
    expect((await call("get_overview", { member: "mom" })).json.schedule.find((x: { kind: string }) => x.kind === "annual-checkup").due).toBe("2027-05-20");
    expect((await call("update_schedule", { member: "mom", kind: "checkup", action: "reschedule", date: "2040-01-01" })).isError).toBe(true);
    expect((await call("update_schedule", { member: "mom", kind: "checkup", action: "reschedule", date: "2027-02-30" })).isError).toBe(true);
    expect((await call("update_schedule", { member: "kz", kind: "recheck", codes: ["ALB"], action: "done" })).text).toContain("no scheduled recheck");
  });

  it("校验失败与不存在的成员返回错误，不写入", async () => {
    const { call } = await connect(repo, true);
    expect((await call("add_log", { member: "nobody", title: "x" })).isError).toBe(true);
    expect((await call("update_profile", { member: "nobody", blood_type: "A" })).isError).toBe(true);
    expect((await call("add_measurements", { member: "kz" })).text).toContain("no measurement");
  });

});

describe.skipIf(!URL)("agent 修改记录与还原（需要 KZ_TEST_DATABASE_URL）", () => {
  it("写入都记在 agent 修改里，可按新到旧还原；被后续修改覆盖的旧记录不能直接还原", async () => {
    const changes = await repo.listAgentChanges();
    expect(changes[0]).toMatchObject({ tokenName: "grokbot", revertible: true });
    expect(changes.map((c) => c.tool)).toEqual(expect.arrayContaining(["add_log", "update_profile", "add_measurements", "add_record", "save_indicator_note", "update_care_plan"]));

    const record = changes.find((c) => c.tool === "add_record" && c.key === "20261030 肝功能复查")!;
    await repo.revertAgentChange(record.id); // 新建的记录还原 = 删除
    expect((await repo.snapshot()).members.find((m) => m.id === "kz")!.records.some((r) => r.slug === "20261030 肝功能复查")).toBe(false);
    await expect(repo.revertAgentChange(record.id)).rejects.toBeInstanceOf(RevertConflict);

    const profile = changes.find((c) => c.tool === "update_profile" && c.member === "kz")!;
    await repo.revertAgentChange(profile.id); // 覆盖的档案还原 = 恢复旧内容
    expect((await repo.snapshot()).members.find((m) => m.id === "kz")!.profile!.conditions).not.toContain("轻度脂肪肝");

    const { call } = await connect(repo, true);
    await call("save_indicator_note", { member: "kz", code: "TG", status: "watch", summary: "第一版", text: "v1" });
    await call("save_indicator_note", { member: "kz", code: "TG", status: "attention", summary: "第二版", text: "v2" });
    const [newer, older] = (await repo.listAgentChanges()).filter((c) => c.key === "TG");
    expect(older.revertible).toBe(false);
    await expect(repo.revertAgentChange(older.id)).rejects.toBeInstanceOf(RevertConflict);
    await repo.revertAgentChange(newer.id);
    expect((await repo.listAgentChanges()).find((c) => c.id === older.id)!.revertible).toBe(true);
  });

  it("其他账号不能还原或看到这些修改", async () => {
    const other = `mcpw-o-${randomId()}`;
    await db.insert(user).values({ id: other, name: other, email: `${other}@example.com` });
    const repoO = new PgRepository(db, other, newDek());
    expect(await repoO.listAgentChanges()).toEqual([]);
    const id = (await repo.listAgentChanges())[0].id;
    await expect(repoO.revertAgentChange(id)).rejects.toThrow();
    await db.delete(user).where(eq(user.id, other));
  });
});

describe.skipIf(!URL)("并发写入与替换（需要 KZ_TEST_DATABASE_URL）", () => {
  it("两个 agent 同时改档案的不同字段：两处修改都保留", async () => {
    const [a, b] = await Promise.all([connect(repo, true), connect(repo, true)]);
    const conds = (await repo.snapshot()).members.find((m) => m.id === "mom")!.profile!.conditions;
    await Promise.all([
      a.call("update_profile", { member: "mom", conditions: [...conds, "并发测试病史"] }),
      b.call("update_profile", { member: "mom", habits: { exercise: "并发测试运动" } }),
    ]);
    const p = (await repo.snapshot()).members.find((m) => m.id === "mom")!.profile!;
    expect(p.conditions).toContain("并发测试病史");
    expect(p.habits.exercise).toBe("并发测试运动");
  });

  it("两个 agent 同时首次写同一份指标分析：还原后写的那次恢复为先写的内容，而不是删除", async () => {
    const [a, b] = await Promise.all([connect(repo, true), connect(repo, true)]);
    await Promise.all([
      a.call("save_indicator_note", { member: "mom", code: "HDL_C", status: "watch", summary: "甲", text: "甲" }),
      b.call("save_indicator_note", { member: "mom", code: "HDL_C", status: "watch", summary: "乙", text: "乙" }),
    ]);
    const [newer, older] = (await repo.listAgentChanges()).filter((c) => c.member === "mom" && c.key === "HDL_C");
    expect(newer.revertible).toBe(true);
    expect(older.revertible).toBe(false);
    const winner = (await repo.snapshot()).members.find((m) => m.id === "mom")!.notes.get("HDL_C")!.summary;
    await repo.revertAgentChange(newer.id);
    const note = (await repo.snapshot()).members.find((m) => m.id === "mom")!.notes.get("HDL_C");
    expect(note).toBeDefined();
    expect(note!.summary).not.toBe(winner);
    expect(["甲", "乙"]).toContain(note!.summary);
  });

  it("add_record replace=true 保留原记录的附件关联与备注", async () => {
    const { call } = await connect(repo, true);
    await repo.applyChanges([{ op: "put", member: "mom", kind: "record", key: "20261020 血脂复查", body: "医生：三个月后复查",
      data: { date: "2026-10-20", type: "lab", title: "血脂复查", attachments: ["attachments/20261020-lipid.pdf"], indicators: [{ code: "TG", value: 2.4, unit: "mmol/L" }] } }]);
    const res = await call("add_record", { member: "mom", date: "2026-10-20", type: "lab", title: "血脂复查", dry_run: false, replace: true,
      indicators: [{ code: "TG", value: 2.1, unit: "mmol/L" }] });
    expect(res.json.ok).toBe(true);
    const rec = (await repo.exportRaw()).docs.mom.find((d) => d.kind === "record" && d.key === "20261020 血脂复查")!;
    expect(rec.data.attachments).toEqual(["attachments/20261020-lipid.pdf"]);
    expect(rec.body).toBe("医生：三个月后复查");
    expect((rec.data.indicators as { value: number }[])[0].value).toBe(2.1);
  });
});

describe.skipIf(!URL)("报告全面录入引导（需要 KZ_TEST_DATABASE_URL）", () => {
  it("只录血脂的体检预览会列出可能漏掉的部分；检查结论文字值进入需要关注；复查日期出现在概览", async () => {
    const { call } = await connect(repo, true);
    const partial = (await call("add_record", { member: "mom", date: "2026-10-31", type: "checkup", title: "年度体检（部分）",
      indicators: [{ code: "TG", value: 3.1, unit: "mmol/L", ref_high: 1.81 }] })).json;
    expect(partial.sections).toEqual({ 血脂: 1 });
    expect(partial.possibly_missing).toEqual(expect.arrayContaining(["体征", "血常规", "检查结论"]));
    expect(partial.next).toContain("every page");

    const full = { member: "mom", date: "2026-10-31", type: "checkup", title: "年度体检", dry_run: false, indicators: [
      { code: "HEIGHT", value: 160, unit: "cm" }, { code: "WEIGHT", value: 55, unit: "kg" }, { code: "SBP", value: 116, unit: "mmHg" },
      { code: "HGB", value: 130, unit: "g/L" }, { code: "U_PRO", value: "阴性" }, { code: "ALT", value: 20, unit: "U/L" },
      { code: "CREA", value: 60, unit: "μmol/L" }, { code: "TG", value: 3.1, unit: "mmol/L", ref_high: 1.81 }, { code: "FBG", value: 5, unit: "mmol/L" },
      { code: "US_LIVER", value: "轻度脂肪肝" }, { code: "ECG", value: "窦性心律" },
    ] };
    const saved = (await call("add_record", full)).json;
    expect(saved.ok).toBe(true);
    expect(saved.abnormal).toEqual(expect.arrayContaining(["US_LIVER 轻度脂肪肝 (A)", "TG 3.1 (H)"]));
    expect((await call("add_record", { ...full, dry_run: true, replace: true })).json.possibly_missing).toBeUndefined();

    await call("save_indicator_note", { member: "mom", code: "TG", status: "watch", summary: "TG 偏高", text: "x", recheck: "2027-01-31" });
    const ov = (await call("get_overview", { member: "mom" })).json;
    expect(ov.attention.map((r: { code: string }) => r.code)).toEqual(expect.arrayContaining(["US_LIVER", "TG"]));
    expect(ov.upcoming_rechecks).toEqual(expect.arrayContaining([expect.objectContaining({ code: "TG", due: "2027-01-31" })]));
  });
});

describe.skipIf(!URL)("其他项目与报告总数（需要 KZ_TEST_DATABASE_URL）", () => {
  it("预览按报告总数核对差额；写入后 get_record 返回 other_items；编造的 code 仍被拒并提示放进 other_items", async () => {
    const { call } = await connect(repo, true);
    const rec = { member: "mom", date: "2026-09-01", type: "lab", title: "微量元素", report_item_count: 3,
      indicators: [{ code: "TE_CU", value: 12.45, unit: "μmol/L", ref_low: 11, ref_high: 24 }],
      other_items: [{ name: "全血铅", value: 18, unit: "μg/L", ref_text: "<100", section: "有毒元素" }] };
    const p = (await call("add_record", rec)).json;
    expect(p.coverage).toEqual({ reported: 3, mapped: 1, other_items: 1, gap: 1 });
    expect(p.next).toContain("1 item(s) still missing");

    const bad = await call("add_record", { ...rec, dry_run: false, indicators: [...rec.indicators, { code: "PB_BLOOD", value: 18 }] });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain("other_items");

    expect((await call("add_record", { ...rec, dry_run: false })).json.ok).toBe(true);
    const got = (await call("get_record", { member: "mom", record: "20260901 微量元素" })).json;
    expect(got.other_items).toEqual([{ name: "全血铅", value: 18, unit: "μg/L", ref_text: "<100", section: "有毒元素" }]);
  });

  it("字典缺口反馈：按名称聚合计数，表里没有用户、数值字段", async () => {
    const { submitFeedback, listFeedback } = await import("@/server/catalog-feedback");
    const { catalogFeedback } = await import("@/db/schema");
    const name = `测试项目-${randomId().slice(0, 6)}`;
    await submitFeedback(db, [{ name: ` ${name} `, unit: "μg/L", section: "有毒元素" }, { name }]);
    await submitFeedback(db, [{ name }]);
    const row = (await listFeedback(db, 1000)).find((r) => r.name === name)!; // 名称已去掉首尾空格
    expect(row.count).toBe(2);
    expect(row.lastSeen.getUTCDate()).toBe(1); // 时间只记到月
    await expect(submitFeedback(db, [])).rejects.toThrow(); // 统一校验：至少一条
    expect(Object.keys(row).sort()).toEqual(["count", "firstSeen", "lastSeen", "name", "nameNorm", "section", "unit"]);
    await db.delete(catalogFeedback).where(eq(catalogFeedback.nameNorm, row.nameNorm));
  });
});

describe.skipIf(!URL)("只有其他项目的报告（需要 KZ_TEST_DATABASE_URL）", () => {
  it("indicators 为空、other_items 有内容时可以保存；都为空时报错", async () => {
    const { call } = await connect(repo, true);
    const rec = { member: "mom", date: "2026-08-01", type: "lab", title: "有毒元素", dry_run: false, other_items: [{ name: "全血铅", value: 18, unit: "μg/L" }] };
    expect((await call("add_record", rec)).json.ok).toBe(true);
    expect((await call("get_record", { member: "mom", record: "20260801 有毒元素" })).json.other_items).toHaveLength(1);
    const listed = (await call("list_records", { member: "mom", from: "2026-08-01", to: "2026-08-01" })).json[0];
    expect(listed).toMatchObject({ items: 1, other_items: 1 }); // 只有其他项目的报告不显示为 0 项
    const empty = await call("add_record", { ...rec, title: "空", other_items: [] });
    expect(empty.isError).toBe(true);
    expect(empty.text).toContain("nothing to save");
  });
});

describe.skipIf(!URL)("MCP 用药与补剂（需要 KZ_TEST_DATABASE_URL）", () => {
  it("用药：药物预览 → 依据必填 → 写入 → 停用；补剂建议不进今日安排，同意后转在用；可还原", async () => {
    const { call } = await connect(repo, true);
    const member = "kz";
    const before = (await call("get_regimen", { member })).json;

    // 药物不能是 agent 建议
    expect((await call("save_regimen_item", { member, name: "阿托伐他汀钙片", kind: "medication", dose: "20 mg", source: "agent" })).isError).toBe(true);

    const add = { member, name: "阿托伐他汀钙片", kind: "medication", dose: "20 mg", source: "prescribed", frequency: "每晚 1 次", related: ["LDL_C"] };
    const preview = (await call("save_regimen_item", add)).json;
    expect(preview.dry_run).toBe(true);
    expect(preview.context).toHaveProperty("allergies");
    expect((await call("get_regimen", { member })).json.plan).toHaveLength(before.plan.length); // 预览不写入

    expect((await call("save_regimen_item", { ...add, dry_run: false })).text).toContain("user_statement");
    const saved = (await call("save_regimen_item", { ...add, dry_run: false, user_statement: "医生开的，每晚一片" })).json;
    expect(saved.ok).toBe(true);
    const plan = (await call("get_regimen", { member })).json;
    const med = plan.plan.find((i: { id: string }) => i.id === saved.id);
    expect(med).toMatchObject({ basis: "医生开的，每晚一片", doctor_confirmed: true, frequency: "每晚 1 次" });
    expect(plan.untimed.some((i: { id: string }) => i.id === saved.id)).toBe(true);
    expect((await call("get_indicator", { member, code: "LDL_C" })).json.related_regimen[0].name).toBe("阿托伐他汀钙片");
    expect((await call("get_overview", { member })).json.active_regimen.some((i: { id: string }) => i.id === saved.id)).toBe(true);

    // 未知指标拒绝
    expect((await call("save_regimen_item", { member, id: saved.id, related: ["NOPE"] })).text).toContain("unknown marker");

    await call("stop_regimen_item", { member, id: saved.id, reason: "医生让停" });
    const afterStop = (await call("get_regimen", { member })).json;
    expect(afterStop.plan.some((i: { id: string }) => i.id === saved.id)).toBe(false);
    expect(afterStop.stopped.find((i: { id: string }) => i.id === saved.id).stop_reason).toBe("医生让停");

    // 补剂建议：默认 suggested，同意后才在用；还没吃的建议撤掉就是删除
    const sug = (await call("save_regimen_item", { member, name: "辅酶Q10", kind: "supplement", dose: "1 粒", source: "agent", times: ["08:00"], reason: "他汀期间", dry_run: false })).json;
    expect(sug.status).toBe("suggested");
    const withSug = (await call("get_regimen", { member })).json;
    expect(withSug.suggested.some((i: { id: string }) => i.id === sug.id)).toBe(true);
    expect(withSug.schedule.some((x: { name: string }) => x.name === "辅酶Q10")).toBe(false);
    expect((await call("save_regimen_item", { member, id: sug.id, status: "active", dry_run: false })).isError).toBe(true);
    await call("save_regimen_item", { member, id: sug.id, status: "active", user_statement: "好的，开始吃", dry_run: false });
    expect((await call("get_regimen", { member })).json.schedule.some((x: { name: string }) => x.name === "辅酶Q10")).toBe(true);

    // 还原最后一次写入，回到建议中
    const changes = await repo.listAgentChanges();
    await repo.revertAgentChange(changes[0].id);
    const fresh = await connect(repo, true); // 还原不经过这个连接，换个连接读新数据
    const reverted = (await fresh.call("get_regimen", { member })).json;
    expect(reverted.suggested.some((i: { id: string }) => i.id === sug.id)).toBe(true);
    await fresh.call("stop_regimen_item", { member, id: sug.id, reason: "不用了" });
    expect((await fresh.call("get_regimen", { member })).json.suggested.some((i: { id: string }) => i.id === sug.id)).toBe(false);
  });
});
