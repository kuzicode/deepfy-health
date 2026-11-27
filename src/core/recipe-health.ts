import { abnormalReadings } from "./analysis";
import { isResolved } from "./health-template";
import type { Recipe } from "./recipe";
import type { Catalog, MemberBundle } from "./schema";

export interface DietFinding {
  kind: "allergy" | "marker" | "condition";
  label: string;
  detail: string;
  sourceDate?: string;
}
export type MissingDietInfo = "profile" | "allergies" | "records" | "recipe_tags";

const rules = [
  { codes: ["TG", "LDL_C", "TC", "ALT", "US_LIVER"], conditions: ["脂肪肝", "高血脂", "血脂"], cautions: ["高油", "高脂", "油炸"], matches: ["少油", "低脂", "清淡"] },
  { codes: ["UA"], conditions: ["痛风", "高尿酸"], cautions: ["高嘌呤"], matches: ["低嘌呤"] },
  { codes: ["FBG", "HBA1C", "GA"], conditions: ["糖尿病", "高血糖", "血糖"], cautions: ["高糖"], matches: ["控糖", "控糖友好", "低糖"] },
  { codes: ["SBP", "DBP"], conditions: ["高血压"], cautions: ["高钠", "重口"], matches: ["低盐", "清淡"] },
];

export const activeConditions = (member: MemberBundle) =>
  (member.profile?.conditions ?? []).filter((name) => name.trim() && !isResolved(name));

export const recordedAllergies = (member: MemberBundle) =>
  (member.profile?.allergies ?? []).map((entry) => entry.trim()).filter(Boolean);

function overlaps(a: string, b: string) {
  const left = a.toLowerCase(), right = b.trim().toLowerCase();
  return right.length > 0 && (left.includes(right) || right.includes(left));
}

function allergyFindings(recipe: Recipe, member: MemberBundle): DietFinding[] {
  const ingredients = recipe.ingredients?.map((item) => item.name) ?? [];
  const candidates = new Set([...(recipe.allergens ?? []), ...ingredients]);
  return recordedAllergies(member).flatMap((detail) =>
    [...candidates].filter((label) => overlaps(detail, label))
      .map((label) => ({ kind: "allergy", label, detail, sourceDate: member.profile?.updated })));
}

function missingInfo(recipe: Recipe, member: MemberBundle): MissingDietInfo[] {
  const missing: MissingDietInfo[] = [];
  if (!member.profile) missing.push("profile");
  else if (!recordedAllergies(member).length) missing.push("allergies");
  if (!member.records.some((r) => r.type === "checkup" || r.type === "lab")) missing.push("records");
  if (![recipe.diet_tags, recipe.caution_tags, recipe.allergens].some((tags) => tags?.length)) missing.push("recipe_tags");
  return missing;
}

type Source = Omit<DietFinding, "label">;

function findings(tags: Set<string>, labels: string[], sources: Source[]): DietFinding[] {
  return labels.filter((label) => tags.has(label)).flatMap((label) => sources.map((source) => ({ label, ...source })));
}

export function assessRecipeForMember(recipe: Recipe, member: MemberBundle, catalog: Catalog) {
  const cautions = allergyFindings(recipe, member);
  const matches: DietFinding[] = [];
  const tags = new Set([...(recipe.tags ?? []), ...(recipe.diet_tags ?? []), ...(recipe.caution_tags ?? [])].map((tag) => tag.trim()));
  const markers = abnormalReadings(member, catalog);
  const active = activeConditions(member);
  for (const rule of rules) {
    const sources: Source[] = [
      ...markers.filter((r) => rule.codes.includes(r.code)).map((r) => ({
        kind: "marker" as const, detail: `${r.code} · ${r.value} ${r.unit}`.trim(), sourceDate: r.date,
      })),
      ...active.filter((c) => rule.conditions.some((term) => c.includes(term))).map((detail) => ({
        kind: "condition" as const, detail, sourceDate: member.profile?.updated,
      })),
    ];
    cautions.push(...findings(tags, rule.cautions, sources));
    matches.push(...findings(tags, rule.matches, sources));
  }
  return { cautions, matches, missing: missingInfo(recipe, member) };
}
