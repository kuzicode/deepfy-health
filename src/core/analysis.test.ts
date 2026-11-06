import { describe, expect, it } from "vitest";
import { activeItems, addMonths, ageOn, bmi, computeFlag, effectiveRange, latestReadings, regimenOn, nextCheckup, reminders, rollForward, regimenSpans, regimenWarnings, relatedOptions, schedule, series, spanMarks, summarize, summarizeLatest, untimedOn, upcomingRechecks, expiryState } from "./analysis";
import { BUILTIN_CATALOG } from "./builtin-catalog";
import { RecordSchema, RegimenItemSchema, type MemberBundle, type Reading } from "./schema";

const cat = new Map(BUILTIN_CATALOG.map((e) => [e.code, e]));
const reading = (r: Partial<Reading>): Reading => ({ code: "ALT", value: 0, ...r });

describe("flag 判定", () => {
  it("不含边界的上限：连续数值刚好低于阈值不算高，到阈值才算（VFA ≥100、VFL ≥10、sIgE ≥0.35）", () => {
    const flagOf = (code: string, value: number) => {
      const r = reading({ code, value });
      return computeFlag(r, effectiveRange(r, cat.get(code)));
    };
    expect(flagOf("VFA", 99.5)).toBe("N");
    expect(flagOf("VFA", 100)).toBe("H");
    expect(flagOf("VFL", 9.5)).toBe("N");
    expect(flagOf("VFL", 10)).toBe("H");
    expect(flagOf("SIGE_D1", 0.34)).toBe("N");
    expect(flagOf("SIGE_D1", 0.35)).toBe("H");
    // 普通上限仍包含边界
    expect(flagOf("WBC", 9.5)).toBe("N");
  });

  it("报告范围优先于 catalog", () => {
    const r = reading({ value: 45, ref_low: 0, ref_high: 40 });
    expect(effectiveRange(r, cat.get("ALT"), "male")).toEqual({ low: 0, high: 40 });
    expect(computeFlag(r, effectiveRange(r, cat.get("ALT"), "male"))).toBe("H");
  });
  it("无报告范围时按性别取 catalog", () => {
    const r = reading({ code: "HGB", value: 120 });
    expect(computeFlag(r, effectiveRange(r, cat.get("HGB"), "male"))).toBe("L");
    expect(computeFlag(r, effectiveRange(r, cat.get("HGB"), "female"))).toBe("N");
  });
  it("只有单侧上限", () => {
    const r = reading({ code: "TG", value: 1.2 });
    expect(computeFlag(r, effectiveRange(r, cat.get("TG")))).toBe("N");
  });
  it("定性结果", () => {
    const e = cat.get("U_PRO");
    expect(computeFlag(reading({ code: "U_PRO", value: "阴性" }), {}, e)).toBe("N");
    expect(computeFlag(reading({ code: "U_PRO", value: "+" }), {}, e)).toBe("A");
  });
  it("显式 flag 优先", () => {
    expect(computeFlag(reading({ value: 10, flag: "H" }), { high: 50 })).toBe("H");
  });
  it("没有任何范围时不判定", () => {
    expect(computeFlag(reading({ code: "WEIGHT", value: 70 }), {})).toBeNull();
  });
});

describe("日期与体征", () => {
  it("年龄按生日是否已过计算", () => {
    expect(ageOn("1990-05-20", "2026-05-19")).toBe(35);
    expect(ageOn("1990-05-20", "2026-05-20")).toBe(36);
  });
  it("addMonths 处理月末", () => {
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonths("2025-10-12", 12)).toBe("2026-10-12");
  });
  it("BMI", () => {
    expect(bmi({ height_cm: 175, weight_kg: 78 } as never)).toBe(25.5);
  });
});

const member = (over: Partial<MemberBundle>): MemberBundle => ({
  id: "x", name: "X", role: "member", records: [], notes: new Map(), logs: [], ...over,
});
const rec = (date: string, type: "checkup" | "lab", code = "ALT") => ({
  date, type, title: "t", slug: date, body: "", attachments: [], indicators: [{ code, value: 1 }],
});

describe("提醒", () => {
  it("无体检记录 → 立即提醒", () => {
    expect(reminders(member({}), "2026-11-02")[0]).toMatchObject({ kind: "annual-checkup", overdue: false });
  });
  it("体检未满一年且不在 30 天窗口内 → 不提醒", () => {
    expect(reminders(member({ records: [rec("2026-06-01", "checkup")] }), "2026-11-02")).toEqual([]);
  });
  it("超过一年 → overdue（逾期 30 天内）", () => {
    expect(reminders(member({ records: [rec("2025-10-01", "checkup")] }), "2026-10-20")[0]).toMatchObject({ overdue: true, due: "2026-10-01" });
  });
  it("逾期超过 30 天未确认 → 顺延半年，记下原定日期", () => {
    expect(rollForward("2026-10-01", "2026-10-31")).toBe("2026-10-01"); // 逾期 30 天
    expect(rollForward("2026-10-01", "2026-11-01")).toBe("2027-04-01"); // 逾期 31 天
    expect(rollForward("2025-10-01", "2026-11-02")).toBe("2027-04-01"); // 连续顺延
    const [r] = schedule(member({ records: [rec("2025-10-01", "checkup")] }), "2026-11-02");
    expect(r).toMatchObject({ kind: "annual-checkup", due: "2027-04-01", originalDue: "2026-10-01", overdue: false });
  });
  it("lab 不算年度体检", () => {
    const rs = reminders(member({ records: [rec("2025-01-01", "checkup"), rec("2026-10-01", "lab")] }), "2026-01-15");
    expect(rs[0].due).toBe("2026-01-01");
  });
  it("手动设定的下次体检晚于上次体检时生效；之后录入新体检回到推算", () => {
    const profile = { id: "x", name: "X", sex: "male" as const, birth_date: "1990-01-01", conditions: [], allergies: [], family_history: [], habits: {}, checkup_interval_months: 12, next_checkup: "2027-03-01", body: "" };
    expect(nextCheckup(member({ profile, records: [rec("2026-10-31", "checkup")] }))).toBe("2027-03-01");
    expect(nextCheckup(member({ profile, records: [rec("2027-03-05", "checkup")] }))).toBe("2028-03-05");
    expect(nextCheckup(member({ profile }))).toBe("2027-03-01");
    expect(nextCheckup(member({}))).toBeUndefined();
    // 没有体检记录：手动日期标 scheduled（邮件要提醒）；完全没安排则没有 scheduled
    const first = reminders(member({ profile: { ...profile, next_checkup: "2026-01-20" } }), "2026-01-15").find((r) => r.kind === "annual-checkup")!;
    expect(first).toMatchObject({ due: "2026-01-20", params: { scheduled: "2026-01-20" } });
    expect(reminders(member({}), "2026-01-15").find((r) => r.kind === "annual-checkup")!.params).not.toHaveProperty("scheduled");
  });
  it("笔记之后有新结果 → 仍在日程里但带 newResult；确认已检查后消失", () => {
    const note = { code: "ALT", updated: "2026-01-01", status: "watch" as const, summary: "", recheck: "2026-10-20", body: "" };
    const base = { records: [rec("2026-06-01", "checkup", "TG"), rec("2026-10-18", "lab", "ALT")], notes: new Map([["ALT", note]]) };
    expect(reminders(member(base), "2026-11-02").find((r) => r.kind === "recheck")).toMatchObject({ code: "ALT", newResult: "2026-10-18" });
    const done = { ...base, notes: new Map([["ALT", { ...note, rechecked: "2026-11-02" }]]) };
    expect(reminders(member(done), "2026-11-02").some((r) => r.kind === "recheck")).toBe(false);
  });
});

describe("用药补剂", () => {
  const item = { id: "a", name: "A", kind: "supplement" as const, dose: "1", times: ["20:00", "08:00"], start: "2026-01-01", related: [], doctor_confirmed: false };
  it("按时间排序、起止日期过滤", () => {
    const m = member({ regimen: { items: [{ ...item, end: "2026-12-31" }], body: "" } });
    expect(regimenOn(m, "2026-11-02").map((s) => s.time)).toEqual(["08:00", "20:00"]);
    expect(regimenOn(m, "2025-12-31")).toEqual([]);
    expect(regimenOn(m, "2027-01-01")).toEqual([]);
  });
  it("按星期过滤（2026-11-02 是周一）", () => {
    const m = member({ regimen: { items: [{ ...item, days: ["tue"] }], body: "" } });
    expect(regimenOn(m, "2026-11-02")).toEqual([]);
    expect(regimenOn(m, "2026-11-03")).toHaveLength(2);
  });
});

describe("Codex review 回归", () => {
  it("单位与 catalog 不同且无报告范围 → 不套用默认范围，不判定", () => {
    const r = reading({ code: "FBG", value: 100, unit: "mg/dL" });
    expect(effectiveRange(r, cat.get("FBG"))).toEqual({});
    expect(computeFlag(r, effectiveRange(r, cat.get("FBG")), cat.get("FBG"))).toBeNull();
  });
  it("趋势序列只保留与最新读数同单位的点", () => {
    const m = member({
      records: [
        { date: "2025-01-01", type: "lab", title: "a", slug: "a", body: "", attachments: [], indicators: [{ code: "FBG", value: 5.5, unit: "mmol/L" }] },
        { date: "2025-06-01", type: "lab", title: "b", slug: "b", body: "", attachments: [], indicators: [{ code: "FBG", value: 100, unit: "mg/dL" }] },
        { date: "2026-01-01", type: "lab", title: "c", slug: "c", body: "", attachments: [], indicators: [{ code: "FBG", value: 5.9, unit: "mmol/L" }] },
      ],
    });
    expect(series(m, cat, "FBG").map((p) => p.value)).toEqual([5.5, 5.9]);
  });
  it("上次结果只取同单位的值", () => {
    const rec = (date: string, value: number, unit: string) =>
      ({ date, type: "lab" as const, title: date, slug: date, body: "", attachments: [], indicators: [{ code: "FBG", value, unit }] });
    const latest = (records: ReturnType<typeof rec>[]) => latestReadings(member({ records }), cat).find((r) => r.code === "FBG");
    expect(latest([rec("2025-01-01", 5, "mmol/L"), rec("2026-01-01", 100, "mg/dL")])?.previous).toBeUndefined();
    expect(latest([rec("2025-01-01", 5, "mmol/L"), rec("2026-01-01", 5.6, "mmol/L")])?.previous).toBe(5);
  });

  it("summarize 区分异常、未判定、正常", () => {
    expect(summarize(["H", null, "N", "A", null])).toEqual({ abnormal: 2, unknown: 2, normal: 1 });
  });
  it("非法日历日期与时间被拒绝", () => {
    const base = { date: "2026-01-01", type: "lab", title: "t", indicators: [{ code: "ALT", value: 1 }] };
    expect(RecordSchema.safeParse(base).success).toBe(true);
    expect(RecordSchema.safeParse({ ...base, date: "2026-99-99" }).success).toBe(false);
    expect(RecordSchema.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false);
    const item = { id: "a", name: "A", kind: "supplement", dose: "1", times: ["25:00"], start: "2026-01-01" };
    expect(RegimenItemSchema.safeParse(item).success).toBe(false);
    expect(RegimenItemSchema.safeParse({ ...item, times: ["23:59"] }).success).toBe(true);
  });
});

describe("双语支持", () => {
  it("内置字典每个指标都有英文名", () => {
    expect(BUILTIN_CATALOG.filter((e) => !e.name_en).map((e) => e.code)).toEqual([]);
  });
  it("提醒带 params", () => {
    const r = reminders(member({ records: [rec("2025-10-01", "checkup")] }), "2026-10-20")[0];
    expect(r.params).toEqual({ last: "2025-10-01", interval: 12 });
  });
});

describe("检查结论与复查", () => {
  it("文字结论：正常描述判 N，其余判 A，显式 flag 优先", () => {
    const f = (code: string, value: string, flag?: "N") => computeFlag(reading({ code, value, flag }), {}, cat.get(code));
    expect(f("US_LIVER", "轻度脂肪肝")).toBe("A");
    expect(f("US_GALLBLADDER", "未见明显异常")).toBe("N");
    expect(f("ECG", "窦性心律")).toBe("N");
    expect(f("ECG", "窦性心动过缓", "N")).toBe("N");
    expect(cat.get("HEIGHT")?.unit).toBe("cm");
  });

  it("单位比较忽略大小写与 μ/u", () => {
    expect(effectiveRange(reading({ code: "AFP", value: 2, unit: "ng/ml" }), cat.get("AFP"))).toEqual({ low: undefined, high: 7 });
    expect(effectiveRange(reading({ code: "UA", value: 300, unit: "umol/L" }), cat.get("UA"), "male").high).toBe(428);
  });

  it("upcomingRechecks 不受 30 天提醒窗口限制；之后有新结果时标出 newResult", () => {
    const note = (code: string, recheck: string) => [code, { code, updated: "2026-11-03", status: "watch" as const, summary: code, recheck, body: "" }] as const;
    const m: MemberBundle = {
      id: "x", name: "X", role: "member", records: [], logs: [],
      notes: new Map([note("TG", "2027-01-31"), note("LDL_C", "2027-01-31"), note("ALT", "2026-12-15")]),
    };
    expect(upcomingRechecks(m).map((r) => [r.code, r.due])).toEqual([["ALT", "2026-12-15"], ["LDL_C", "2027-01-31"], ["TG", "2027-01-31"]]);
    expect(reminders(m, "2026-11-03").filter((r) => r.kind === "recheck")).toEqual([]); // 超出 30 天提醒窗口
    m.records.push(RecordSchema.parse({ date: "2027-01-20", type: "lab", title: "复查", indicators: [{ code: "TG", value: 1.5 }] }) as MemberBundle["records"][number]);
    expect(upcomingRechecks(m).map((r) => [r.code, r.newResult])).toEqual([["ALT", undefined], ["LDL_C", undefined], ["TG", "2027-01-20"]]);
  });

  it("schedule 列出全部待办（不限 30 天），同一天的复查合并成一条", () => {
    const note = (code: string, recheck: string) => [code, { code, updated: "2026-11-03", status: "watch" as const, summary: code, recheck, body: "" }] as const;
    const m: MemberBundle = {
      id: "x", name: "X", role: "member", records: [], logs: [],
      notes: new Map([note("TG", "2027-01-31"), note("LDL_C", "2027-01-31"), note("ECG", "2026-11-20"), note("ALT", "2026-10-10")]),
    };
    const s = schedule(m, "2026-11-03");
    expect(s.map((x) => [x.kind, x.due, x.codes, x.overdue, x.soon])).toEqual([
      ["recheck", "2026-10-10", ["ALT"], true, true],
      ["annual-checkup", "2026-11-03", [], false, true], // 没有体检记录 → 今天
      ["recheck", "2026-11-20", ["ECG"], false, true],
      ["recheck", "2027-01-31", ["LDL_C", "TG"], false, false],
    ]);
    // reminders 仍按条、只含 30 天内
    expect(reminders(m, "2026-11-03").map((r) => r.code ?? r.kind)).toEqual(["ALT", "annual-checkup", "ECG"]);
  });
});

describe("summarizeLatest", () => {
  it("身高体重这类纯测量项不算无法判定；没进字典的项目仍算", () => {
    const m: MemberBundle = { id: "x", name: "X", role: "member", notes: new Map(), logs: [], records: [
      RecordSchema.parse({ date: "2026-10-31", type: "checkup", title: "体检", indicators: [
        { code: "HEIGHT", value: 171.5, unit: "cm" }, { code: "WEIGHT", value: 66.8, unit: "kg" }, { code: "TG", value: 3.1 }, { code: "CUSTOM_X", value: 1 },
      ] }) as MemberBundle["records"][number],
    ] };
    expect(summarizeLatest(latestReadings(m, cat), cat)).toEqual({ abnormal: 1, unknown: 1, normal: 0 });
  });
});

describe("审查回归：文字结论、纯测量项、只有其他项目", () => {
  it("检查结论只有整句是正常结论才判 N；复合结论不会因开头正常而漏判", () => {
    const f = (code: string, value: string) => computeFlag(reading({ code, value }), {}, cat.get(code));
    expect(f("ECG", "窦性心律，ST-T改变")).toBe("A");
    expect(f("ECG", "窦性心律。")).toBe("N");
    expect(f("US_GALLBLADDER", "未见明显异常 ")).toBe("N");
    expect(f("US_GALLBLADDER", "未见明显异常，胆囊壁毛糙")).toBe("A");
    expect(f("U_PRO", "阴性(-)")).toBe("N"); // 化验定性结果仍按前缀
    // 常见的正常心电图写法仍判正常（每一段都是正常结论）
    for (const ok of ["正常心电图", "大致正常心电图", "窦性心律，正常心电图", "窦性心律。心电图正常。"]) expect(f("ECG", ok)).toBe("N");
    // 「主语 + 正常结论」也判正常；主语里有异常描述则不算
    for (const ok of ["内科/外科均未见明显异常", "外眼未见明显异常", "肝胆胰脾未见明显异常"]) expect(f(ok.startsWith("内科") ? "PHYS_EXAM" : "US_LIVER", ok)).toBe("N");
    for (const bad of ["胆囊息肉未见明显增大", "右肾囊肿", "甲状腺结节，余未见明显异常", "视力减退原因待查"]) expect(f("US_KIDNEY", bad)).toBe("A");
    // 否定表达不是正常结论（Codex review P1）
    for (const bad of ["非正常心电图", "心电图不正常", "非窦性心律", "窦性心律，非正常心电图"]) expect(f("ECG", bad)).toBe("A");
    // 英文：abnormal 不是「ab + normal」；否定词与词边界（Codex review P1）
    for (const bad of ["abnormal", "Abnormal ECG", "not normal", "ECG not normal", "non-normal", "borderline abnormal", "isn't normal"]) expect(f("ECG", bad)).toBe("A");
    for (const ok of ["normal", "Normal ECG", "ecg normal", "unremarkable", "no abnormal"]) expect(f("ECG", ok)).toBe("N");
  });

  it("报告明确标了异常的项目（如 MPV=15, flag=H）不会被当成纯测量项隐藏", () => {
    const m: MemberBundle = { id: "x", name: "X", role: "member", notes: new Map(), logs: [], records: [
      RecordSchema.parse({ date: "2026-10-31", type: "lab", title: "血常规", indicators: [
        { code: "MPV", value: 15, unit: "fL", flag: "H" }, { code: "PDW", value: 16 }, { code: "HEIGHT", value: 171.5, unit: "cm" },
        { code: "WEIGHT", value: 70, unit: "kg", flag: "H" },
      ] }) as MemberBundle["records"][number],
    ] };
    // MPV(H)、WEIGHT(H) 计入异常；PDW 无范围无标记 → 无法判定；HEIGHT 纯测量 → 不计
    expect(summarizeLatest(latestReadings(m, cat), cat)).toEqual({ abnormal: 2, unknown: 1, normal: 0 });
  });

  it("全部项目都未收录时，只有 other_items 也能保存；两者都空才拒绝", () => {
    const base = { date: "2026-10-31", type: "lab", title: "微量元素" };
    expect(RecordSchema.parse({ ...base, other_items: [{ name: "全血铅", value: 18 }] }).indicators).toEqual([]);
    expect(RecordSchema.safeParse({ ...base }).success).toBe(false);
  });
});

describe("用药状态", () => {
  const base = { id: "a", name: "阿托伐他汀", kind: "medication" as const, dose: "20 mg", times: ["20:00"], start: "2026-01-01", related: ["LDL_C"], doctor_confirmed: true };
  const member = (items: Partial<typeof base & Record<string, unknown>>[], allergies: string[] = []) =>
    ({ id: "m", name: "m", dir: "m", role: "member", records: [], notes: new Map(), logs: [], profile: { allergies }, regimen: { items: items.map((i) => RegimenItemSchema.parse({ ...base, ...i })), body: "" } }) as unknown as MemberBundle;

  it("老数据没有 status 也没有新字段：仍是在用，进今日安排", () => {
    const m = member([{}]);
    expect(activeItems(m)).toHaveLength(1);
    expect(regimenOn(m, "2026-03-01")).toHaveLength(1);
  });

  it("times 可以留空：不进定时安排，进未定时间；按需也一样", () => {
    const m = member([{ id: "x", times: [], frequency: "每日 2 次" }, { id: "y", as_needed: true }]);
    expect(regimenOn(m, "2026-03-01")).toEqual([]);
    expect(untimedOn(m, "2026-03-01").map((i) => i.id)).toEqual(["x", "y"]);
  });

  it("已停用：不再提醒结束 / 有效期，也不进今天的安排，但停用前的日子仍算吃过", () => {
    const m = member([{ end: "2026-02-01", expiry: "2026-02-01", status: "stopped", stopped_on: "2026-01-20" }]);
    expect(reminders(m, "2026-11-01").filter((r) => r.kind !== "annual-checkup")).toEqual([]);
    expect(regimenOn(m, "2026-01-19")).toHaveLength(1);
    expect(regimenOn(m, "2026-01-20")).toEqual([]);
  });

  it("建议中：不进今日安排、不提醒，也不算吃过", () => {
    const m = member([{ kind: "supplement", source: "agent", status: "suggested", end: "2026-12-01", expiry: "2026-12-01" } as never]);
    expect(regimenOn(m, "2026-11-30")).toEqual([]);
    expect(reminders(m, "2026-11-30").filter((r) => r.kind !== "annual-checkup")).toEqual([]);
    expect(regimenSpans(m, "LDL_C")).toEqual([]);
  });

  it("有效期：在用的进日程；计划结束与有效期同时存在时各一条", () => {
    const m = member([{ end: "2026-12-01", expiry: "2026-11-20" }]);
    const kinds = schedule(m, "2026-11-05").map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(["supply-expiry", "regimen-review"]));
    expect(expiryState({ expiry: "2026-12-01" }, "2026-11-05")).toBe("soon");
    expect(expiryState({ expiry: "2026-11-01" }, "2026-11-05")).toBe("expired");
    expect(expiryState({ expiry: "2027-11-01" }, "2026-11-05")).toBeUndefined();
  });

  it("schema：药物不能是 agent 建议；已停用要有日期", () => {
    expect(RegimenItemSchema.safeParse({ ...base, status: "suggested" }).success).toBe(false);
    expect(RegimenItemSchema.safeParse({ ...base, source: "agent" }).success).toBe(false);
    expect(RegimenItemSchema.safeParse({ ...base, status: "stopped" }).success).toBe(false);
    expect(RegimenItemSchema.safeParse({ ...base, kind: "supplement", status: "suggested", source: "agent" }).success).toBe(true);
  });

  it("写入检查：重复、过敏、过期；已停用的不算重复", () => {
    const m = member([{ id: "a" }, { id: "b", name: "阿托伐他汀钙片" }, { id: "old", name: "鱼油", status: "stopped", stopped_on: "2026-02-01" }], ["青霉素（皮疹）"]);
    const parse = (o: object) => RegimenItemSchema.parse({ ...base, id: "new", ...o });
    expect(regimenWarnings(parse({}), m, "2026-11-05").map((w) => w.code)).toEqual(["duplicate"]);
    expect(regimenWarnings(parse({ name: "鱼油" }), m, "2026-11-05")).toEqual([]);
    expect(regimenWarnings(parse({ name: "青霉素V钾片" }), m, "2026-11-05")).toEqual([{ code: "allergy", allergy: "青霉素（皮疹）" }]);
    expect(regimenWarnings(parse({ name: "X", expiry: "2026-01-01" }), m, "2026-11-05")).toEqual([{ code: "expired", expiry: "2026-01-01" }]);
  });

  it("编辑表单的指标选项：已关联但没测过的也列出，已有结果的不重复", () => {
    const measured = [{ code: "LDL_C", name: "低密度脂蛋白" }];
    expect(relatedOptions(measured, ["LDL_C", "ALT"], (c) => `名称-${c}`)).toEqual([{ code: "LDL_C", name: "低密度脂蛋白" }, { code: "ALT", name: "名称-ALT" }]);
    expect(relatedOptions([], [], String)).toEqual([]);
  });

  it("趋势图：竖线落在事件之后的第一个点；早于首点或晚于末点不画", () => {
    const dates = ["2026-01-01", "2026-03-01", "2026-06-01"];
    const span = { name: "A", kind: "medication" as const, stopped: true };
    expect(spanMarks(dates, [{ ...span, start: "2026-02-01", end: "2026-04-01" }])).toEqual([
      { date: "2026-03-01", kind: "start", name: "A" }, { date: "2026-06-01", kind: "end", name: "A" },
    ]);
    expect(spanMarks(dates, [{ ...span, start: "2025-01-01", end: "2027-01-01" }])).toEqual([]);
  });
});
