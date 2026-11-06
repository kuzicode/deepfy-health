import { RegimenItemSchema } from "@/core/schema";
import { AdoptForm, parseRegimenForm } from "@/server/regimen-form";
import { checkRegimenRules } from "./regimen-tools";
import { removeItemDoc, saveItemDoc, stopItemDoc } from "./regimen-write";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeCatalog } from "@/core/bundle";
import { normName } from "@/core/names";
import { RecordSchema } from "@/core/schema";
import { loadVault } from "@/core/vault";
import { dedupe } from "@/server/catalog-feedback";
import { lookupIndicator } from "./tools";
import { previewRecord, recordDoc, stripDatePrefix } from "./write";

const SAMPLE = path.resolve(import.meta.dirname, "../../examples/sample-vault/Personal");
const catalog = mergeCatalog([]);
const top = (q: string) => lookupIndicator(catalog, q)[0]?.code;

describe("字典查找与消歧", () => {
  it("报告常见写法都能找到正确的 code，完全匹配排在前面", () => {
    expect(top("PCT")).toBe("PLT_PCT");
    expect(top("血小板压积（PCT）")).toBe("PLT_PCT");
    expect(top("中性粒细胞绝对值(NEUT#)")).toBe("NEUT_ABS");
    expect(top("EOS%")).toBe("EO_PCT");
    expect(top("铁(全血)")).toBe("TE_FE");
    expect(top("Hp-Ab")).toBe("HP_AB");
    expect(top("HBsAg")).toBe("HBSAG");
    expect(top("谷丙转氨酶(ALT)")).toBe("ALT");
    expect(top("随机血糖")).toBe("GLU_RAND");
    expect(top("血糖(随机)")).toBe("GLU_RAND");
    expect(top("空腹血糖")).toBe("FBG");
    expect(lookupIndicator(catalog, "葡萄糖")[0].note).toContain("GLU_RAND");
  });

  it("标题开头与记录日期重复时去掉（避免 key 变成「日期 日期 标题」）", () => {
    expect(stripDatePrefix("2026-02-10", "20260210 过敏原特异性IgE（20项）")).toBe("过敏原特异性IgE（20项）");
    expect(stripDatePrefix("2026-02-10", "2026-02-10 · 血脂")).toBe("血脂");
    expect(stripDatePrefix("2026-02-10", "2026/02/10 血脂")).toBe("血脂");
    expect(stripDatePrefix("2026-02-10", "20250210 血脂")).toBe("20250210 血脂"); // 日期不同不动
    expect(stripDatePrefix("2026-02-10", "20260210")).toBe("20260210"); // 只有日期时保留
    expect(stripDatePrefix("2026-02-10", "年度体检")).toBe("年度体检");
  });

  it("易混项带 note 提示", () => {
    expect(lookupIndicator(catalog, "FER")[0].note).toContain("TE_FE");
    expect(lookupIndicator(catalog, "HP_BREATH")[0].note).toContain("HP_AB");
    expect(lookupIndicator(catalog, "PLT_PCT")[0].note).toContain("降钙素原");
  });

  it("名称归一化：全半角括号、空格、大小写", () => {
    expect(normName(" 血小板压积（PCT） ")).toBe(normName("血小板压积(pct)"));
    expect(dedupe([{ name: "铜" }, { name: " 铜 " }, { name: "锌" }]).map(([k]) => k)).toEqual(["铜", "锌"]);
  });
});

describe("其他项目与总数核对", () => {
  const s = loadVault(SAMPLE);
  const base = { date: "2026-10-31", type: "checkup" as const, title: "体检", indicators: [{ code: "TG", value: 3.1 }] };

  it("other_items 通过校验；旧记录没有这个字段时默认为空", () => {
    expect(RecordSchema.parse({ ...base, other_items: [{ name: "全血铅", value: 12, unit: "μg/L", section: "有毒元素" }] }).other_items).toHaveLength(1);
    expect(RecordSchema.parse(base).other_items).toEqual([]);
    expect(recordDoc({ ...base, other_items: [{ name: "x", value: 1 }] }).data.other_items).toEqual([{ name: "x", value: 1 }]);
    expect(recordDoc(base).data.other_items).toBeUndefined(); // 没有时不写字段，旧格式不变
  });

  it("report_item_count：已映射 + 其他项目 与报告总数的差额", () => {
    const p = previewRecord(s, "kz", { ...base, other_items: [{ name: "全血铅", value: 12 }], report_item_count: 5 }, "k");
    expect(p.coverage).toEqual({ reported: 5, mapped: 1, other_items: 1, gap: 3 });
    expect(previewRecord(s, "kz", base, "k").coverage).toBeUndefined();
  });
});

describe("心脏彩超", () => {
  it("常见写法查到 US_HEART", () => {
    expect(top("心脏彩超")).toBe("US_HEART");
    expect(top("经胸心脏彩色多普勒超声")).toBe("US_HEART");
    expect(top("超声心动图")).toBe("US_HEART");
  });
});

describe("旧记录 key 兼容", () => {
  it("用带日期的原标题替换旧记录时沿用旧 key；没有旧记录时用去重后的 key", async () => {
    const { recordKeyFor } = await import("./write-tools");
    const snap = (slugs: string[]) => ({ members: [{ id: "mom", records: slugs.map((slug) => ({ slug })) }] }) as never;
    const input = { date: "2026-08-06", title: "20260806 血脂血糖" };
    expect(recordKeyFor(snap(["20260806 20260806 血脂血糖"]), "mom", input, "血脂血糖")).toBe("20260806 20260806 血脂血糖");
    expect(recordKeyFor(snap([]), "mom", input, "血脂血糖")).toBe("20260806 血脂血糖");
    expect(recordKeyFor(snap(["20260806 20260806 血脂血糖", "20260806 血脂血糖"]), "mom", input, "血脂血糖")).toBe("20260806 血脂血糖");
    // 第一次替换后标题已清理：agent 第二次用干净标题替换，仍要找到旧 key
    expect(recordKeyFor(snap(["20260806 20260806 血脂血糖"]), "mom", { date: "2026-08-06", title: "血脂血糖" }, "血脂血糖")).toBe("20260806 20260806 血脂血糖");
  });
  it("带分隔符的旧日期标题（- / .），无论原标题还是清理后的标题都找到旧 key", async () => {
    const { recordKeyFor } = await import("./write-tools");
    const { recordKey } = await import("./write");
    const snap = (slugs: string[]) => ({ members: [{ id: "mom", records: slugs.map((slug) => ({ slug })) }] }) as never;
    for (const old of ["2026-08-06 血脂血糖", "2026/08/06 血脂血糖", "2026.08.06 血脂血糖", "2026-08-06·血脂血糖"]) {
      const legacy = recordKey("2026-08-06", old);
      expect(recordKeyFor(snap([legacy]), "mom", { date: "2026-08-06", title: "血脂血糖" }, "血脂血糖")).toBe(legacy);
      expect(recordKeyFor(snap([legacy]), "mom", { date: "2026-08-06", title: old }, "血脂血糖")).toBe(legacy);
    }
    // 同一天的其他记录不误认
    expect(recordKeyFor(snap(["20260806 2026-08-06 尿常规"]), "mom", { date: "2026-08-06", title: "血脂血糖" }, "血脂血糖")).toBe("20260806 血脂血糖");
  });
});

describe("健康计划篇幅提醒", () => {
  it("超过 2000 字或有表格时提醒精简，正常篇幅不提醒", async () => {
    const { carePlanHint } = await import("./write-tools");
    expect(carePlanHint("## 现在的情况\n- 血脂偏高\n")).toBeUndefined();
    expect(carePlanHint("x".repeat(2100))).toContain("2100 characters");
    expect(carePlanHint("| 指标 | 结果 |\n|---|---|\n| TG | 3.1 |")).toContain("tables");
  });
});

describe("字典扩充", () => {
  it("内置字典没有重复 code", async () => {
    const { BUILTIN_CATALOG } = await import("@/core/builtin-catalog");
    const codes = BUILTIN_CATALOG.map((e) => e.code);
    expect(codes.filter((c, i) => codes.indexOf(c) !== i)).toEqual([]);
  });

  it("报告常见写法查到新增 code", () => {
    expect(top("内脏脂肪等级")).toBe("VFL");
    expect(top("VFA")).toBe("VFA"); // 面积（cm²）不是等级
    expect(top("内脏脂肪面积")).toBe("VFA");
    expect(top("腰臀比")).toBe("WHR");
    expect(top("户尘螨d1过敏原特异性IgE")).toBe("SIGE_D1");
    expect(top("蟹f23过敏原特异性IgE")).toBe("SIGE_F23");
    expect(top("总IgE")).toBe("IGE_TOTAL");
    expect(top("尿微量白蛋白/肌酐比")).toBe("UACR");
    expect(top("糖化白蛋白百分比")).toBe("GA_PCT");
    expect(top("α-羟丁酸脱氢酶")).toBe("HBDH");
    expect(top("醛固酮")).toBe("ALDO");
    expect(top("肝硬度")).toBe("LSM");
    expect(top("红细胞(镜检)")).toBe("U_RBC_M");
    expect(top("尿潜血")).toBe("U_BLD");
  });
});

describe("用药 / 补剂写入", () => {
  const med = { id: "rx-1", name: "阿托伐他汀", kind: "medication", dose: "20 mg", times: [], start: "2026-01-01", related: [], doctor_confirmed: true, source: "prescribed" };
  const prev = { kind: "regimen" as const, key: "", data: { updated: "2026-01-01", items: [med] }, body: "医生交代的备注" };
  const T = "2026-11-05";

  it("新增不碰其他条目和正文；id 由服务端生成", () => {
    const r = saveItemDoc(prev, { name: "维生素D3", kind: "supplement", dose: "1 粒", source: "self" }, T);
    expect(r.doc.body).toBe("医生交代的备注");
    expect((r.doc.data.items as unknown[])).toHaveLength(2);
    expect(r.item.id).toMatch(/^rx-[a-z0-9]+$/);
    expect(r.item.start).toBe(T);
    expect(r.item.doctor_confirmed).toBe(false);
  });

  it("编辑只改给出的字段；null 清空字段；找不到 id 报错", () => {
    const r = saveItemDoc({ ...prev, data: { items: [{ ...med, reason: "血脂高" }] } }, { id: "rx-1", dose: "10 mg", reason: null }, T);
    expect(r.item.dose).toBe("10 mg");
    expect(r.item.reason).toBeUndefined();
    expect(r.item.name).toBe("阿托伐他汀");
    expect(r.changed).toEqual(expect.arrayContaining(["dose", "reason"]));
    expect(() => saveItemDoc(prev, { id: "nope" }, T)).toThrow(/not found/);
  });

  it("采纳建议：开始日期改成今天；停用信息在恢复时清掉", () => {
    const sug = { ...med, id: "s", kind: "supplement", source: "agent", status: "suggested", start: "2026-01-01" };
    expect(saveItemDoc({ ...prev, data: { items: [sug] } }, { id: "s", status: "active" }, T).item.start).toBe(T);
    const stopped = stopItemDoc(prev, { id: "rx-1", on: "2026-10-01", reason: "医生让停" }, T).item;
    expect(stopped.status).toBe("stopped");
    const back = saveItemDoc({ ...prev, data: { items: [stopped] } }, { id: "rx-1", status: "active" }, T).item;
    expect(back.stopped_on).toBeUndefined();
    expect(back.stop_reason).toBeUndefined();
  });

  it("采纳已过结束日期的建议被拒绝，给了新结束日期或清空后才写入", () => {
    const sug = { ...med, id: "s", kind: "supplement", source: "agent", status: "suggested", start: "2026-10-20", end: "2026-11-03" };
    const doc = { ...prev, data: { items: [sug] } };
    expect(() => saveItemDoc(doc, { id: "s", status: "active" }, T)).toThrow(/end date 2026-11-03 is before the start date 2026-11-05/);
    expect(saveItemDoc(doc, { id: "s", status: "active", end: "2026-12-01" }, T).item).toMatchObject({ start: T, end: "2026-12-01" });
    expect(saveItemDoc(doc, { id: "s", status: "active", end: null }, T).item.end).toBeUndefined();
    expect(saveItemDoc({ ...doc, data: { items: [{ ...sug, end: T }] } }, { id: "s", status: "active" }, T).item.end).toBe(T);
  });

  it("任何写入都拒绝起止日期倒置（含改开始日期晚于停用日期）", () => {
    expect(() => saveItemDoc(prev, { name: "鱼油", kind: "supplement", dose: "1 粒", source: "self", start: "2026-11-05", end: "2026-11-01" }, T)).toThrow(/before the start/);
    expect(() => saveItemDoc(prev, { id: "rx-1", end: "2025-12-31" }, T)).toThrow(/before the start/);
    const stopped = stopItemDoc(prev, { id: "rx-1", on: "2026-10-01" }, T).item;
    expect(() => saveItemDoc({ ...prev, data: { items: [stopped] } }, { id: "rx-1", start: "2026-10-02" }, T)).toThrow(/before the start/);
  });

  it("停用日期不能早于开始；删除只去掉这一条", () => {
    expect(() => stopItemDoc(prev, { id: "rx-1", on: "2025-01-01" }, T)).toThrow(/before the start/);
    expect(removeItemDoc(prev, "rx-1", T).data.items).toEqual([]);
    expect(removeItemDoc(prev, "rx-1", T).body).toBe("医生交代的备注");
  });

  it("agent 规则：新条目要有来源；自己的建议必须 suggested；实质改动要有依据；只加注释不用", () => {
    const parsed = RegimenItemSchema.parse(med);
    const supp = RegimenItemSchema.parse({ ...med, id: "n", kind: "supplement", source: "agent", doctor_confirmed: false });
    expect(() => checkRegimenRules(RegimenItemSchema.parse({ ...med, source: undefined }), undefined, ["name"], "x")).toThrow(/source is required/);
    expect(() => checkRegimenRules(supp, undefined, ["name"], "x")).toThrow(/must be saved with status/);
    expect(() => checkRegimenRules(parsed, undefined, ["name"], undefined)).toThrow(/user_statement/);
    expect(() => checkRegimenRules(parsed, parsed, ["dose"], " ")).toThrow(/user_statement/);
    expect(() => checkRegimenRules(parsed, parsed, ["precautions", "basis"], undefined)).not.toThrow();
    expect(() => checkRegimenRules({ ...parsed, status: "suggested" }, parsed, ["status"], "x")).toThrow(/cannot go back/);
    expect(() => checkRegimenRules({ ...supp, status: "suggested" }, undefined, ["name"], undefined)).not.toThrow();
  });
});

describe("用药页表单", () => {
  const form = (o: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
    return f;
  };
  const ok = { kind: "supplement", name: "鱼油", dose: "1 粒", source: "self", prescriber: "", frequency: "", reason: "", brand: "", spec: "", start: "2026-11-01", end: "", expiry: "", meal: "", times: "", precautions: "" };

  it("采纳表单：没填结束日期是清空，没带这个字段是不动，格式错误拒绝", () => {
    expect(AdoptForm.parse({ end: "" }).end).toBeNull();
    expect(AdoptForm.parse({}).end).toBeUndefined();
    expect(AdoptForm.parse({ end: "2026-12-01" }).end).toBe("2026-12-01");
    expect(AdoptForm.safeParse({ end: "明天" }).success).toBe(false);
  });

  it("空值变成清空字段；时间、注意事项、星期、指标按格式拆开", () => {
    expect(parseRegimenForm(form(ok))).toMatchObject({ end: null, expiry: null, reason: null, with_food: null, days: null, precautions: null, times: [], as_needed: false });
    expect(parseRegimenForm(form({ ...ok, times: "8:00，20:00", precautions: "随餐\n\n 避免西柚 ", days: ["sun", "mon"], related: ["LDL_C", "bad code"], meal: "fasting", as_needed: "on" }))).toMatchObject({
      times: ["08:00", "20:00"], precautions: ["随餐", "避免西柚"], days: ["mon", "sun"], related: ["LDL_C"], with_food: false, as_needed: true,
    });
  });

  it("时间格式不对、缺名称、未知来源都拒绝", () => {
    expect(parseRegimenForm(form({ ...ok, times: "25:00" }))).toBeUndefined();
    expect(parseRegimenForm(form({ ...ok, name: " " }))).toBeUndefined();
    expect(parseRegimenForm(form({ ...ok, source: "x" }))).toBeUndefined();
  });
});
