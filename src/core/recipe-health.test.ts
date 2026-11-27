import { expect, it } from "vitest";
import type { Recipe } from "./recipe";
import { assessRecipeForMember } from "./recipe-health";
import { ProfileSchema, type MemberBundle } from "./schema";

const date = "2025-02-05";
const member: MemberBundle = {
  id: "a", name: "A", role: "member", records: [], notes: new Map(), logs: [],
  profile: { ...ProfileSchema.parse({ id: "a", name: "A", sex: "male", birth_date: "1998-04-05", updated: date }), body: "" },
};
const assess = (recipe: Recipe, m = member) => assessRecipeForMember(recipe, m, new Map());
const recipe: Recipe = { slug: "soup", title: "Soup", body: "Simmer." };

it("过敏史与标注及配料双向子串匹配，保留依据、日期和原菜谱", () => {
  const dish = { ...recipe, allergens: ["NUT"], ingredients: [{ name: "Pea protein" }, { name: "oil" }] };
  const original = structuredClone(dish);
  const result = assess(dish, { ...member, profile: { ...member.profile!, allergies: ["Pea", "Walnut"] } });
  expect(result.cautions).toEqual([
    { kind: "allergy", label: "Pea protein", detail: "Pea", sourceDate: date },
    { kind: "allergy", label: "NUT", detail: "Walnut", sourceDate: date },
  ]);
  expect(dish).toEqual(original);
});

it.each([
  ["TG", "脂肪肝", "油炸", "清淡"], ["UA", "痛风", "高嘌呤", "低嘌呤"],
  ["HBA1C", "糖尿病", "高糖", "控糖友好"], ["DBP", "高血压", "重口", "低盐"],
])("%s 异常和在病状况均带来源，已愈病史不参与", (code, condition, caution, match) => {
  const m: MemberBundle = { ...member, profile: { ...member.profile!, conditions: [condition, condition + "（已愈）"] },
    records: [{ slug: "test", title: "Test", type: "lab", date, indicators: [{ code, flag: "H", value: 123 }], attachments: [], body: "" }] };
  const result = assess({ ...recipe, caution_tags: [caution], diet_tags: [match] }, m);
  for (const [items, label] of [[result.cautions, caution], [result.matches, match]] as const) {
    expect(items).toEqual([
      { kind: "marker", detail: code + " · 123", sourceDate: date, label },
      { kind: "condition", detail: condition, sourceDate: date, label },
    ]);
  }
  expect(result.missing).toEqual(["allergies"]);
  m.records.push({ ...m.records[0], date: "2025-02-06", indicators: [{ code, flag: "N", value: 88 }] });
  m.profile!.conditions = [condition + "（已愈）"];
  expect(assess({ ...recipe, tags: [caution, match] }, m)).toMatchObject({ matches: [], cautions: [] });
});

it("无档案、未填过敏史、缺检查和标签分别报告", () => {
  expect(assess(recipe, { ...member, profile: undefined }).missing).toEqual(["profile", "records", "recipe_tags"]);
  expect(assess(recipe, { ...member, records: [{
    slug: "monitor", title: "Monitor", type: "device", date, indicators: [{ code: "SBP", value: 110 }], attachments: [], body: "",
  }] }).missing).toContain("records");
  expect(assess(recipe).missing).toEqual(["allergies", "records", "recipe_tags"]);
});
