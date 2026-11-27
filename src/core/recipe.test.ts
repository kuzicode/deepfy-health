import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { RawVaultSchema } from "../server/api";
import { buildSnapshot, householdDocPath, parseMd, isSafeHouseholdDocKey, type RawHouseholdDoc, type RawVault } from "./bundle";
import { RecipeIngredientSchema, RecipeSchema, isSafeRecipeCover, mergeRecipeFrontmatter, recipeSlugFromTitle } from "./recipe";
import { rawToFiles } from "./serialize";
import { VaultRepository } from "./vault";

const legacy: RawVault = { family: { members: [] }, docs: {}, customCatalog: [] };
const recipe = (key: string, data: Record<string, unknown> = { title: key }): RawHouseholdDoc =>
  ({ kind: "recipe", key, data, body: "拌匀即可。" });

const roots: string[] = [];
function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kzh-recipe-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it("标题是唯一必填字段，极简菜谱保留步骤", () => {
  const raw = { ...legacy, householdDocs: [recipe("拌菜", { title: "  拌菜 " }), recipe("缺标题", {})] };
  const snapshot = buildSnapshot(raw, { root: "test" });
  expect(snapshot.recipes).toMatchObject([{ title: "拌菜", slug: "拌菜", body: "拌匀即可。" }]);
  expect(snapshot.issues).toMatchObject([{ level: "error", file: "菜单/缺标题.md" }]);
});

it.each([
  { title: "   " }, { title: "菜".repeat(81) }, { type: "note" }, { category: "甜点" },
  { difficulty: "unknown" }, { cover_style: "svg" }, { rating: 0 }, { rating: 6 }, { rating: 2.5 },
  { updated: "2025-02-29" }, { updated: "2024-2-29" }, { updated: "2024-04-31" },
  { servings: 0 }, { cook_minutes: -1 }, { prep_minutes: 1.5 }, { ingredients: [{}] },
  { ingredients: [{ name: "料".repeat(61) }] }, { diet_tags: "素食" },
])("拒绝不符合契约的字段 %j", (fields) => {
  expect(RecipeSchema.safeParse({ title: "家常菜", ...fields }).success).toBe(false);
});

it("读取文档时拒绝可执行的 frontmatter 格式", () => {
  expect(() => parseMd("---js\ntitle: 汤\n---\n")).toThrow("不支持 JavaScript frontmatter");
});

it("允许字段边界与手写属性", () => {
  const data = { title: "菜".repeat(80), updated: "2024-02-29", rating: 1, cook_minutes: 0, aliases: ["拿手菜"], extra: null };
  expect(RecipeSchema.parse(data)).toEqual(data);
  expect(RecipeIngredientSchema.parse({ name: "料".repeat(60), marker: "备好" }).marker).toBe("备好");
});

it("补丁只删除显式 undefined，不改输入或丢弃空值", () => {
  const old = { title: "汤", aliases: ["例汤"], source: "手记", empty: null };
  const patch = { source: undefined, active: false, label: "", count: 0, extra: null };
  expect(mergeRecipeFrontmatter(old, patch)).toEqual({ title: "汤", aliases: ["例汤"], active: false, label: "", count: 0, extra: null, empty: null });
  expect(old.source).toBe("手记");
});

it.each(["../escape", "a/b", "a\\b", "a..b", ".hidden", "_draft", "菜单", "", "a\u007fb", "a\nb"])("拒绝家庭文档 key %j", (key) => {
  const doc = recipe(key);
  const raw = { ...legacy, householdDocs: [doc] };
  expect(isSafeHouseholdDocKey("recipe", key)).toBe(false);
  expect(() => householdDocPath(doc)).toThrow();
  expect(() => rawToFiles(raw)).toThrow();
  expect(RawVaultSchema.safeParse(raw).success).toBe(false);
  expect(buildSnapshot(raw, { root: "test" }).issues).toMatchObject([{ level: "error" }]);
});

it.each(["../x.png", "/abs.png", "assets/x.svg", "assets/a..b.png", "assets/a/b.jpg", "assets/a\\b.jpg", "assets/x\n.jpg"])
("拒绝封面 %j", (cover) => {
  expect(isSafeRecipeCover(cover)).toBe(false);
  expect(RecipeSchema.safeParse({ title: "面", cover }).success).toBe(false);
});

it("允许白名单封面后缀和中文文件名", () => {
  for (const ext of ["webp", "png", "jpg", "jpeg"]) expect(isSafeRecipeCover(`assets/一碗面_2.${ext}`)).toBe(true);
});

it("生成可用作 key 的 slug，保留字母、数字、中文与连字符并限制长度", () => {
  expect(recipeSlugFromTitle(" 米/饭 A-2_好! ")).toBe("米饭A-2_好");
  expect(recipeSlugFromTitle("饭".repeat(81))).toHaveLength(80);
  for (const title of ["菜单", "_draft", "/!?"]) expect(isSafeHouseholdDocKey("recipe", recipeSlugFromTitle(title))).toBe(true);
});

it("三个入口均接受缺少 householdDocs 的旧数据", () => {
  expect(buildSnapshot(legacy, { root: "test" }).recipes).toEqual([]);
  expect(Object.keys(rawToFiles(legacy)).sort()).toEqual(["_health/indicators.yaml", "family.yaml"]);
  expect(RawVaultSchema.parse(legacy).householdDocs).toEqual([]);
});

it("导入入口保留家庭文档并校验类型、正文与 frontmatter 大小", () => {
  const doc = recipe("汤", { title: "汤", source: { hand: true } });
  const raw = { ...legacy, householdDocs: [doc] };
  expect(RawVaultSchema.parse(raw)).toEqual(raw);
  for (const fields of [{ kind: "other" }, { body: "a".repeat(200_001) }, { data: { x: "a".repeat(1_000_001) } }]) {
    expect(RawVaultSchema.safeParse({ ...legacy, householdDocs: [{ ...doc, ...fields }] }).success).toBe(false);
  }
});

it("优先用 updated，缺失时用文件修改时间，同一日期按标题排列", () => {
  const raw = { ...legacy, householdDocs: [
    { ...recipe("z", { title: "Z", updated: "2024-06-01" }), updatedAt: "2024-09-01T00:00:00Z" },
    { ...recipe("b"), updatedAt: "2024-07-01T00:00:00Z" },
    recipe("a", { title: "A", updated: "2024-06-01" }),
  ] };
  expect(buildSnapshot(raw, { root: "test" }).recipes.map((r) => r.slug)).toEqual(["b", "a", "z"]);
});

it("无 family.yaml 仍可读菜谱，跳过目录索引、草稿和非 Markdown 文件", async () => {
  const root = tempRoot();
  const dir = path.join(root, "菜单");
  fs.mkdirSync(dir);
  const text = "---\ntitle: 测试菜\n---\n\n配 [[例汤]]。\n";
  for (const file of ["测试菜.md", "菜单.md", "_draft.md", "菜谱.base"]) fs.writeFileSync(path.join(dir, file), text);
  const reader = new VaultRepository(root);
  const reads = vi.spyOn(fs, "readFileSync");
  const dirs = vi.spyOn(fs, "readdirSync");
  const recipes = await reader.listRecipes();
  expect(recipes).toMatchObject([{ slug: "测试菜", body: "\n配 [[例汤]]。\n" }]);
  expect(await reader.getRecipe("测试菜")).toEqual(recipes[0]);
  expect(await reader.getRecipe("不存在")).toBeUndefined();
  expect(await reader.getRecipe("../越界")).toBeUndefined();
  expect(reads.mock.calls.map(([file]) => file)).toEqual(Array(2).fill(path.join(dir, "测试菜.md")));
  expect(dirs.mock.calls.map(([folder]) => folder)).toEqual([dir]);
});

it("成员摘要只读取 family.yaml 并限制返回的字段", async () => {
  const root = tempRoot();
  const file = path.join(root, "family.yaml");
  fs.writeFileSync(file, "members:\n  - { id: a, name: 阿甲, dir: A, email: a@example.test }\n");
  const reads = vi.spyOn(fs, "readFileSync");
  const dirs = vi.spyOn(fs, "readdirSync");
  expect(await new VaultRepository(root).listMemberStubs()).toEqual([{ id: "a", name: "阿甲", dir: "A", role: "member" }]);
  expect(reads.mock.calls.map(([f]) => f)).toEqual([file]);
  expect(dirs).not.toHaveBeenCalled();
});
