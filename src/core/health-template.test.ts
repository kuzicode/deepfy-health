import { describe, expect, it } from "vitest";
import { mergeCatalog } from "./bundle";
import { attentionCount, checkupPlan, conditionFocus, isResolved } from "./health-template";
import type { HealthRecord, MemberBundle } from "./schema";

const catalog = mergeCatalog([]);
const profile = (sex: "male" | "female", birth: string) => ({
  id: "x", name: "X", sex, birth_date: birth, conditions: [], allergies: [], family_history: [], habits: {}, checkup_interval_months: 12, body: "",
});
const rec = (date: string, title: string, indicators: HealthRecord["indicators"]): HealthRecord =>
  ({ date, type: "checkup", title, slug: date, body: "", attachments: [], indicators });
const member = (over: Partial<MemberBundle>): MemberBundle =>
  ({ id: "x", name: "X", role: "member", records: [], notes: new Map(), logs: [], ...over });

describe("健康模板 checkupPlan", () => {
  it("按记录判断已覆盖 / 过期 / 从未查过；无数值检查按标题关键词", () => {
    const m = member({
      profile: profile("male", "1996-01-15"),
      records: [
        rec("2026-10-15", "年度体检（含心电图）", [{ code: "ALT", value: 30, unit: "U/L" }, { code: "SBP", value: 120, unit: "mmHg" }]),
        rec("2024-05-01", "化验", [{ code: "TSH", value: 2, unit: "mIU/L" }]),
      ],
    });
    const plan = checkupPlan(m, catalog, "2026-11-03");
    const by = Object.fromEntries(plan.items.map((x) => [x.id, x.status]));
    expect(by).toMatchObject({ liver: "covered", bp: "covered", ecg: "covered", thyroid: "due", lipid: "missing" });
    expect(by.breast).toBeUndefined(); // 性别条件
    expect(by.psa).toBeUndefined(); // 年龄条件
    expect(by.spine).toBeUndefined(); // 只在相关时出现
    expect(plan.covered).toBe(3);
  });

  it("异常指标与近期症状相关的项目排在前面；颈椎不适时出现颈腰椎", () => {
    const m = member({
      profile: profile("female", "1980-01-01"),
      records: [rec("2026-09-01", "体检", [{ code: "HGB", value: 98, unit: "g/L" }])],
      logs: [{ date: "2026-10-28", type: "symptom", title: "连续加班后头晕、眼干", tags: ["颈椎"], attachments: [], slug: "20261028-2230", body: "" }],
    });
    const plan = checkupPlan(m, catalog, "2026-11-03");
    const top = plan.suggestions.slice(0, 4).map((x) => x.id);
    expect(top).toContain("cbc"); // 血红蛋白偏低：即使已查过也建议复查
    expect(top).toContain("bp"); // 头晕
    expect(plan.items.find((x) => x.id === "spine")?.related).toEqual(["symptom:颈椎"]);
    expect(plan.items.some((x) => x.id === "breast")).toBe(true);
    expect(plan.items.some((x) => x.id === "colon")).toBe(true);
  });
});

describe("已知状况 conditionFocus", () => {
  it("轻度脂肪肝 → 肝功能、血脂、腹部 B 超；没有调养方案时标出；方案覆盖后变为已有", () => {
    const m = member({ profile: { ...profile("male", "1996-01-15"), conditions: ["轻度脂肪肝"] } });
    const [c] = conditionFocus(m, catalog, "2026-11-03");
    expect(c.name).toBe("轻度脂肪肝");
    expect(c.checks.map((x) => x.id).sort()).toEqual(["lipid", "liver", "ultrasound"]);
    expect(c.codes).toEqual(expect.arrayContaining(["ALT", "TG"]));
    expect(c.hasPlan).toBe(false);
    // 档案里的病情也参与体检建议排序
    expect(checkupPlan(m, catalog, "2026-11-03").items.find((x) => x.id === "lipid")!.related).toContain("condition:轻度脂肪肝");

    const withPlan = { ...m, carePlan: { updated: "2026-11-03", focus: ["ALT"], body: "# 方案" } };
    expect(conditionFocus(withPlan, catalog, "2026-11-03")[0].hasPlan).toBe(true);
  });

  it("没有映射的状况也会列出（检查为空），没有病情时为空", () => {
    expect(conditionFocus(member({ profile: { ...profile("female", "1990-01-01"), conditions: ["偏头痛"] } }), catalog, "2026-11-03")[0])
      .toMatchObject({ name: "偏头痛", checks: [], hasPlan: false });
    expect(conditionFocus(member({ profile: profile("female", "1990-01-01") }), catalog, "2026-11-03")).toEqual([]);
  });
});

describe("已愈状况", () => {
  it("isResolved 识别「已愈 / 痊愈 / 既往」等写法", () => {
    for (const x of ["肺炎（2024-03，已愈）", "肺炎 痊愈", "既往胆囊炎", "Pneumonia (resolved)"]) expect(isResolved(x)).toBe(true);
    for (const x of ["轻度脂肪肝", "高血压", "愈合不良的伤口", "高血压（未治愈）", "糖尿病（尚未治愈）", "肺结核 没有痊愈", "unresolved", "Asthma (not cured)", "not resolved"]) expect(isResolved(x)).toBe(false);
    expect(isResolved("胃炎（2025 已治愈）")).toBe(true);
  });

  it("conditionFocus 标出 resolved；已愈状况不参与体检加查推荐", () => {
    const m = member({ profile: { ...profile("male", "1996-01-15"), conditions: ["脂肪肝（2025，已愈）"] } });
    expect(conditionFocus(m, catalog, "2026-11-03")[0]).toMatchObject({ resolved: true });
    expect(checkupPlan(m, catalog, "2026-11-03").items.flatMap((x) => x.related).some((r) => r.startsWith("condition:"))).toBe(false);
  });
});

describe("检查结论 code 与关键词兜底", () => {
  it("US_LIVER 结论判定腹部 B 超已覆盖，并让脂肪肝状况显示异常与复查日期；旧记录按标题关键词仍算覆盖", () => {
    const m = member({
      profile: { ...profile("male", "1996-01-15"), conditions: ["轻度脂肪肝"] },
      records: [rec("2026-10-31", "年度体检", [{ code: "US_LIVER", value: "轻度脂肪肝" }, { code: "ECG", value: "窦性心律" }])],
      notes: new Map([["TG", { code: "TG", updated: "2026-11-03", status: "watch", summary: "TG 偏高", recheck: "2027-01-31", body: "" }]]),
    });
    const by = Object.fromEntries(checkupPlan(m, catalog, "2026-11-03").items.map((x) => [x.id, x.status]));
    expect(by).toMatchObject({ ultrasound: "covered", ecg: "covered" });
    const [c] = conditionFocus(m, catalog, "2026-11-03");
    expect(c.abnormal).toContain("US_LIVER");
    expect(c.nextRecheck).toBe("2027-01-31");

    const legacy = member({ profile: profile("male", "1996-01-15"), records: [rec("2026-10-31", "体检（含心电图、腹部B超）", [{ code: "ALT", value: 20 }])] });
    const lb = Object.fromEntries(checkupPlan(legacy, catalog, "2026-11-03").items.map((x) => [x.id, x.status]));
    expect(lb).toMatchObject({ ultrasound: "covered", ecg: "covered" });
  });
});

describe("糖代谢相关状况与其他项目异常", () => {
  it("「糖调节异常」对应到血糖检查", () => {
    const m = member({ profile: { ...profile("female", "1972-01-15"), conditions: ["糖调节异常"] } });
    const [c] = conditionFocus(m, catalog, "2026-11-04");
    expect(c.checks.map((x) => x.id)).toContain("glucose");
    expect(c.codes).toEqual(expect.arrayContaining(["FBG", "HBA1C"]));
  });

  it("其他项目里的异常计入记录异常数；概览按名称取最近一次、只列异常", async () => {
    const { latestOtherAbnormal, otherAbnormalCount } = await import("./analysis");
    const r1 = { ...rec("2026-02-10", "过敏原", []), slug: "a", other_items: [
      { name: "户尘螨 d1", value: 5.2, unit: "KUA/L", flag: "H" as const },
      { name: "小麦 f4", value: 0.05, unit: "KUA/L", flag: "N" as const },
      { name: "花生 f13", value: 1.6, flag: "H" as const },
    ] };
    const r0 = { ...rec("2025-02-10", "过敏原", []), slug: "b", other_items: [{ name: "户尘螨 d1", value: 0.1, flag: "N" as const }, { name: "狗皮屑 e5", value: 2.4, flag: "H" as const }] };
    expect(otherAbnormalCount(r1)).toBe(2);
    const list = latestOtherAbnormal(member({ records: [r0, r1] }));
    expect(list.map((x) => [x.name, x.date])).toEqual([["户尘螨 d1", "2026-02-10"], ["花生 f13", "2026-02-10"], ["狗皮屑 e5", "2025-02-10"]]);
  });
});

describe("冠脉钙化", () => {
  it("「冠脉钙化」关联到血脂与心电图", () => {
    const m = member({ profile: { ...profile("male", "1967-01-15"), conditions: ["冠脉壁钙化（2024-05 CT 所见）"] } });
    const [c] = conditionFocus(m, catalog, "2026-11-04");
    expect(c.checks.map((x) => x.id)).toEqual(expect.arrayContaining(["lipid", "ecg"]));
  });
});

describe("单位校验", () => {
  it("心率 bpm 与 次/分 视为同一单位；Lp(a) 的 nmol/L 是登记过的备用单位，带报告范围时不警告", async () => {
    const { unitsComparable } = await import("./analysis");
    const { altUnitWithRange } = await import("./bundle");
    expect(unitsComparable({ code: "HR", value: 62, unit: "bpm" }, catalog.get("HR"))).toBe(true);
    const lpa = catalog.get("LPA")!;
    expect(unitsComparable({ code: "LPA", value: 13.6, unit: "nmol/L" }, lpa)).toBe(false); // 仍不和 mg/L 混画趋势
    expect(altUnitWithRange({ unit: "nmol/L", ref_low: 0, ref_high: 75 }, lpa)).toBe(true);
    expect(altUnitWithRange({ unit: "nmol/L" }, lpa)).toBe(false); // 没有报告范围仍要提示
    expect(altUnitWithRange({ unit: "umol/L", ref_high: 1 }, lpa)).toBe(false);
  });
});

describe("review 修复（0.17.5）", () => {
  it("随机血糖没有报告范围时无法判定，不会把 11.1 判正常", async () => {
    const { computeFlag, effectiveRange } = await import("./analysis");
    const entry = catalog.get("GLU_RAND");
    const r = { code: "GLU_RAND", value: 11.1, unit: "mmol/L" };
    expect(computeFlag(r, effectiveRange(r, entry), entry)).toBeNull();
    const withRef = { ...r, value: 6.5, ref_low: 3.9, ref_high: 6.1 };
    expect(computeFlag(withRef, effectiveRange(withRef, entry), entry)).toBe("H");
  });

  it("心率 bpm / 次/分 在趋势和「较上次」里算同一单位；Lp(a) 不同单位仍分开", async () => {
    const { series, latestReadings } = await import("./analysis");
    const m = member({ records: [
      rec("2026-10-01", "a", [{ code: "HR", value: 70, unit: "次/分" }, { code: "LPA", value: 200, unit: "mg/L" }]),
      { ...rec("2026-11-03", "b", [{ code: "HR", value: 62, unit: "bpm" }, { code: "LPA", value: 14, unit: "nmol/L", ref_low: 0, ref_high: 75 }]), slug: "b" },
    ] });
    expect(series(m, catalog, "HR").map((p) => p.value)).toEqual([70, 62]);
    expect(latestReadings(m, catalog).find((x) => x.code === "HR")?.previous).toBe(70);
    expect(series(m, catalog, "LPA").map((p) => p.value)).toEqual([14]);
    expect(latestReadings(m, catalog).find((x) => x.code === "LPA")?.previous).toBeUndefined();
  });
});

describe("定性项目的高低标记", () => {
  it("尿潜血「+/-」带 H 显示为异常；数值项照常偏高", async () => {
    const { computeFlag, effectiveRange } = await import("./analysis");
    const bld = catalog.get("U_BLD");
    expect(computeFlag({ code: "U_BLD", value: "+/-", flag: "H" }, {}, bld)).toBe("A");
    const ua = catalog.get("UA");
    const r = { code: "UA", value: 539, unit: "μmol/L", flag: "H" as const };
    expect(computeFlag(r, effectiveRange(r, ua), ua)).toBe("H");
  });
});

describe("需关注 attentionCount", () => {
  it("异常指标 + 未愈状况；已愈不算；同一指标只算最新一次", () => {
    const m = member({
      profile: { ...profile("male", "1996-01-15"), conditions: ["脂肪肝", "肺炎（2024-03，已愈）", " "] },
      records: [
        rec("2026-01-01", "旧", [{ code: "WBC", value: 20 }, { code: "RBC", value: 20 }]),
        rec("2026-10-01", "新", [{ code: "WBC", value: 6 }]),
      ],
    });
    expect(attentionCount(m, catalog)).toBe(2); // RBC 仍异常 + 脂肪肝
  });

  it("只有状况没有记录也算；什么都没有返回 null", () => {
    expect(attentionCount(member({ profile: { ...profile("male", "1996-01-15"), conditions: ["偏头痛"] } }), catalog)).toBe(1);
    expect(attentionCount(member({ profile: profile("male", "1996-01-15") }), catalog)).toBeNull();
  });
});
