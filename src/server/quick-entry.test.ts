import { describe, expect, it } from "vitest";
import { ageOn } from "@/core/analysis";
import { LogForm, MeasureForm, NewMemberForm, ProfileForm, logKey, manualRecordKey, mergeMeasures, newMemberId, newMemberProfile, patchProfile, sniffImage, splitList } from "./quick-entry";

describe("快速建档表单", () => {
  it("新成员 id 是安全 slug", () => {
    expect(newMemberId()).toMatch(/^m-[a-z0-9]{6}$/);
  });
  it("新成员表单：身高体重可空，数字字符串转为数值", () => {
    expect(NewMemberForm.parse({ name: " 妈妈 ", sex: "female", birth_date: "1965-01-15", height_cm: "", weight_kg: "58.5" }))
      .toEqual({ name: "妈妈", sex: "female", birth_date: "1965-01-15", relation: undefined, age: undefined, height_cm: undefined, weight_kg: 58.5 });
    expect(NewMemberForm.safeParse({ name: "", sex: "male", birth_date: "1990-01-01" }).success).toBe(false);
    expect(NewMemberForm.safeParse({ name: "老爸", sex: "male", birth_date: "" }).success).toBe(false); // 生日和年龄至少一个
    expect(NewMemberForm.safeParse({ name: "老爸", sex: "male", relation: "boss", age: "60" }).success).toBe(false);
  });
  it("只填大概年龄：估算生日，各个日期下年龄都正好是填的数", () => {
    for (const today of ["2026-01-01", "2026-03-15", "2026-07-01", "2026-11-04", "2026-12-31", "2028-02-29"]) {
      const p = newMemberProfile("m-x", NewMemberForm.parse({ name: "老爸", relation: "father", sex: "male", age: "59" }), today);
      expect(p).toMatchObject({ relation: "father", birth_estimated: true });
      expect(ageOn(p.birth_date as string, today)).toBe(59);
    }
    const exact = newMemberProfile("m-y", NewMemberForm.parse({ name: "妈妈", sex: "female", birth_date: "1972-02-15", age: "" }), "2026-11-04");
    expect(exact).toMatchObject({ birth_date: "1972-02-15" });
    expect(exact).not.toHaveProperty("birth_estimated");
  });
  it("建档头像：清单里的 id 写进档案；空或未知的不写（按成员 id 自动分配）", () => {
    const base = { name: "妈妈", sex: "female", age: "54" };
    expect(newMemberProfile("m-a", NewMemberForm.parse({ ...base, avatar: "t07" }), "2026-11-05")).toMatchObject({ avatar: "t07" });
    expect(newMemberProfile("m-b", NewMemberForm.parse({ ...base, avatar: "" }), "2026-11-05")).not.toHaveProperty("avatar");
    expect(newMemberProfile("m-c", NewMemberForm.parse({ ...base, avatar: "../x" }), "2026-11-05")).not.toHaveProperty("avatar");
  });
  it("档案编辑不会丢掉手选的头像", () => {
    const current = { id: "m", name: "妈妈", sex: "female" as const, birth_date: "1972-02-15", avatar: "t07", conditions: [], allergies: [], family_history: [], habits: {}, checkup_interval_months: 12 };
    expect(patchProfile(current, ProfileForm.parse({ relation: "mother" }), "2026-11-05")).toMatchObject({ avatar: "t07" });
  });
  it("档案编辑：补上准确生日去掉估算标记；不填生日保留原值；关系可改可清空", () => {
    const current = { id: "m", name: "老爸", sex: "male" as const, birth_date: "1967-03-15", birth_estimated: true, relation: "father" as const, conditions: [], allergies: [], family_history: [], habits: {}, checkup_interval_months: 12 };
    const keep = patchProfile(current, ProfileForm.parse({ relation: "father", birth_date: "" }), "2026-11-04");
    expect(keep).toMatchObject({ birth_date: "1967-03-15", birth_estimated: true, relation: "father" });
    const fixed = patchProfile(current, ProfileForm.parse({ relation: "", birth_date: "1967-02-15" }), "2026-11-04");
    expect(fixed).toMatchObject({ birth_date: "1967-02-15" });
    expect(fixed).not.toHaveProperty("birth_estimated");
    expect(fixed).not.toHaveProperty("relation");
  });
  it("日志 key：同一分钟递增", () => {
    expect(logKey("2026-11-03", "09:05", new Set())).toBe("20261103-0905");
    expect(logKey("2026-11-03", undefined, new Set(["20261103-0000"]))).toBe("20261103-0000-2");
    expect(LogForm.parse({ date: "2026-11-03", title: "头晕", tags: "头晕，熬夜、 眼干", severity: "2", time: "" }))
      .toMatchObject({ tags: ["头晕", "熬夜", "眼干"], severity: 2, time: undefined, type: "symptom" });
  });
  it("身体数据：同一天合并，同一指标以新值覆盖，空表单返回 undefined", () => {
    const f = MeasureForm.parse({ date: "2026-11-03", WEIGHT: "67.2", SBP: "", DBP: "", HR: "", FBG: "" });
    const first = mergeMeasures(undefined, f)!;
    expect(first.data).toMatchObject({ type: "manual", indicators: [{ code: "WEIGHT", value: 67.2, unit: "kg" }] });
    const prev = { kind: "record" as const, key: manualRecordKey("2026-11-03"), data: first.data, body: "" };
    const next = mergeMeasures(prev, MeasureForm.parse({ date: "2026-11-03", WEIGHT: "67", SBP: "128", DBP: "82" }))!;
    expect((next.data.indicators as { code: string; value: number }[]).map((r) => `${r.code}=${r.value}`)).toEqual(["WEIGHT=67", "SBP=128", "DBP=82"]);
    expect(mergeMeasures(undefined, MeasureForm.parse({ date: "2026-11-03" }))).toBeUndefined();
  });
  it("档案编辑只覆盖表单字段，列表按中英文逗号拆分", () => {
    const current = { id: "kz", name: "KZ", sex: "male" as const, birth_date: "1996-01-15", conditions: [], allergies: ["青霉素"], family_history: [], habits: { other: "久坐" }, checkup_interval_months: 12 };
    const out = patchProfile(current, ProfileForm.parse({ height_cm: "172", conditions: "鼻炎, 颈椎病", allergies: "青霉素", sleep: "0:30 睡", checkup_interval_months: "" }), "2026-11-03");
    expect(out).toMatchObject({ id: "kz", sex: "male", height_cm: 172, conditions: ["鼻炎", "颈椎病"], habits: { other: "久坐", sleep: "0:30 睡" }, checkup_interval_months: 12, updated: "2026-11-03" });
  });
  it("按文件头识别图片，伪造扩展名无效", () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))?.ext).toBe("jpg");
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext).toBe("png");
    expect(sniffImage(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]))?.ext).toBe("webp");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeUndefined();
  });
});

describe("splitList", () => {
  it("括号里的逗号不拆，其余分隔符照常", () => {
    expect(splitList("轻度脂肪肝、肺炎（2024-03，已愈）;高血压\n 胆囊息肉(3mm, 2024)")).toEqual(["轻度脂肪肝", "肺炎（2024-03，已愈）", "高血压", "胆囊息肉(3mm, 2024)"]);
    expect(splitList(" ,、 ")).toEqual([]);
  });
});
