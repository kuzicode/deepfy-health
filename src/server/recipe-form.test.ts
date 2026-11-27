import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import zh from "../../messages/zh.json";
import AppLayout from "../../app/(app)/layout";
import KitchenPage from "../../app/(app)/kitchen/page";
import RecipePage from "../../app/(app)/kitchen/[slug]/page";
import { VaultRepository } from "@/core/vault";
import { GET } from "../../app/(app)/kitchen/files/[...path]/route";
import { deleteRecipeAction, saveRecipeAction } from "../../app/(app)/kitchen/actions";
import type { RawHouseholdDoc, RawVault } from "@/core/bundle";
import { MAX_RECIPE_COVER_BYTES } from "@/core/recipe";
import { kitchenDb } from "@/test/kitchen-db";
import { newDek, sha256 } from "./crypto";
import { PgRepository } from "./pg-repository";
import { buildRecipeChange, parseRecipeForm } from "./recipe-form";

const today = "2026-01-02";
const steps = "\nSimmer gently.\n";
const raw = (householdDocs: RawHouseholdDoc[] = []): RawVault => ({ family: { members: [] }, docs: {}, customCatalog: [], householdDocs });
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};
const change = (values: Record<string, string>, docs?: RawHouseholdDoc[]) =>
  buildRecipeChange(raw(docs), parseRecipeForm(form(values)), today);

it("只填菜名与做法即可建菜，不需要健康成员", () => {
  expect(change({ title: "Soup!", body: steps })).toEqual({
    op: "create_household", kind: "recipe", key: "Soup", data: { title: "Soup!", updated: today }, body: steps,
  });
});

it.each(["title", "body"])("缺少或留空 %s 返回该字段的错误", (key) => {
  const values: Record<string, string> = { title: "Soup", body: steps };
  delete values[key];
  expect(() => change(values)).toThrow(key);
  expect(() => change({ ...values, [key]: " \n" })).toThrow(key);
});

it("编辑与改写步骤都保留未知 YAML、封面和 Obsidian 双链", () => {
  const prev = { ...change({ title: "Soup", body: "Serve with [[Rice|rice]]. ![[Note]]\n" }) };
  Object.assign(prev.data, { source: { notebook: 3 }, aliases: ["A"], cover: "assets/s.png", cuisine: "Home", servings: 4 });
  const edit = { slug: prev.key, title: "Soup II", body: prev.body };
  expect(change(edit, [prev])).toMatchObject({ op: "put_household", key: prev.key, data: { ...prev.data, title: edit.title }, body: prev.body });
  expect(change({ ...edit, body: prev.body.replaceAll("\n", "\r\n") }, [prev]).body).toBe(prev.body);
  const next = change({ ...edit, body: "Cool. [[Rice|rice]]", servings: "", cover: "assets/forged.png" }, [prev]);
  expect(next.body).toBe("Cool. [[Rice|rice]]\n\n![[Note]]");
  expect(next.data).toMatchObject({ cover: "assets/s.png", source: { notebook: 3 }, aliases: ["A"], cuisine: "Home" });
  expect(next.data).not.toHaveProperty("servings");
  expect(() => change(edit)).toThrow("missing");
});

it("只改评分时保留打开表单后其他写入者更新的菜名、步骤及封面", () => {
  const prev = change({ title: "Soup", body: steps });
  const latest = { ...prev, data: { ...prev.data, title: "Green soup", cover: "assets/new.png" }, body: "Chill overnight.\r\n" };
  const edit = { slug: prev.key, title: "Soup", body: steps, keep_title: "1", keep_body: "1", rating: "5" };
  expect(change(edit, [latest])).toMatchObject({ data: { ...latest.data, rating: 5 }, body: latest.body });
});

it("同名、仅大小写和规范化后的冲突都自动顺延", () => {
  const first = change({ title: "Soup!", body: steps });
  const second = change({ title: "soup", body: steps }, [first]);
  expect(second.key).toBe("soup-2");
  expect(change({ title: "Soup", body: steps }, [first, second]).key).toBe("Soup-3");
});

it("解析食材 JSON 与逐行文本、数值与标签，同时拒绝损坏的食材 JSON", () => {
  const input = { title: "Peas", body: steps, ingredients: "Peas | 200 g | Main\nSalt", tags: "warm、green", prep_minutes: "0" };
  const ingredients = [{ name: "Peas", amount: "200 g", group: "Main" }, { name: "Salt" }];
  expect(change(input).data).toMatchObject({ ingredients, tags: ["warm", "green"], prep_minutes: 0 });
  expect(change({ ...input, ingredients: JSON.stringify(ingredients) }).data.ingredients).toEqual(ingredients);
  expect(() => change({ ...input, ingredients: "[bad" })).toThrow("ingredients");
  expect(() => change({ ...input, rating: "6" })).toThrow("details");
});

it("共享布局与两个菜谱页面只走轻量读取入口", async () => {
  const reader = VaultRepository.prototype;
  const snapshot = vi.spyOn(reader, "snapshot").mockRejectedValue(new Error("Unexpected health snapshot"));
  const member = vi.spyOn(reader, "getMember");
  const stubs = vi.spyOn(reader, "listMemberStubs").mockResolvedValue([]);
  const recipes = vi.spyOn(reader, "listRecipes").mockResolvedValue([]);
  const detail = vi.spyOn(reader, "getRecipe").mockResolvedValue({ title: "豆汤", slug: "豆汤", body: steps });
  await AppLayout({ children: null });
  await KitchenPage();
  expect(stubs).toHaveBeenCalledOnce();
  stubs.mockClear();
  await RecipePage({ params: Promise.resolve({ slug: encodeURIComponent("豆汤") }), searchParams: Promise.resolve({}) });
  expect(stubs).toHaveBeenCalledOnce();
  expect(recipes).toHaveBeenCalledOnce();
  expect(detail).toHaveBeenCalledExactlyOnceWith("豆汤");
  expect(snapshot).not.toHaveBeenCalled();
  expect(member).not.toHaveBeenCalled();
});

it("仅点选一个已知成员时读取该成员并渲染适配和医疗提示", async () => {
  const reader = VaultRepository.prototype;
  const snapshot = vi.spyOn(reader, "snapshot").mockRejectedValue(new Error("Unexpected health snapshot"));
  const selected = { id: "kz", dir: undefined, name: "阿甲", role: "member" as const };
  const other = { ...selected, id: "b", name: "阿乙" };
  vi.spyOn(reader, "listMemberStubs").mockResolvedValue([selected, other]);
  vi.spyOn(reader, "getRecipe").mockResolvedValue({ slug: "soup", title: "Soup", body: steps });
  const getMember = vi.spyOn(reader, "getMember").mockResolvedValue({
    member: { ...selected, records: [], notes: new Map(), logs: [] }, catalog: new Map(),
  });
  async function render(forMember?: string | string[]) {
    const page = await RecipePage({ params: Promise.resolve({ slug: "soup" }), searchParams: Promise.resolve({ for: forMember }) });
    return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "zh", messages: zh, timeZone: "UTC", children: page }));
  }
  for (const query of [undefined, "unknown", ["kz", "b"]]) {
    const html = await render(query);
    expect(html).toContain('/kitchen/soup?for=kz');
    expect(html).not.toContain(zh.common.disclaimer);
  }
  expect(getMember).not.toHaveBeenCalled();
  const html = await render("kz");
  expect(getMember).toHaveBeenCalledExactlyOnceWith("kz");
  expect(snapshot).not.toHaveBeenCalled();
  expect(html).toContain(zh.app.kitchen.fit.gaps.profile);
  expect(html).toContain(zh.common.disclaimer);
  expect(html).toContain('href="/kitchen/soup"');
  expect(html).not.toContain('/kitchen/soup?for=kz');
});

const jpg = Uint8Array.of(0xff, 0xd8, 0xff, 8);
const request = (...parts: string[]) => GET(new Request("http://fixture.invalid"), { params: Promise.resolve({ path: parts }) });
const session = vi.hoisted(() => ({ requireUser: vi.fn(), userRepository: vi.fn() }));
vi.mock("./session", () => session);
vi.mock("next-intl/server", () => ({ getLocale: () => "zh", getTranslations: () => (key: string) => key }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error("redirect " + href); } }));

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-web-"));
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("HEALTH_VAULT_DIR", dir);
  vi.stubEnv("PERSONAL_SUBDIR", "Personal");
  vi.stubEnv("KZ_EDITION", "self");
  vi.stubEnv("KZ_ATTACHMENT_DIR", path.join(dir, "encrypted"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("封面路由", () => {
  it.each([["assets", "..", "img.jpg"], ["assets", "img.txt"], ["assets", "%2e%2e.jpg"]])("无效图片路径返回 404", async (...parts) => {
    vi.stubEnv("DATABASE_URL", "offline");
    expect((await request(...parts)).status).toBe(404);
    expect(session.userRepository).not.toHaveBeenCalled();
  });

  it("本地路径、图片魔数、生产开关与符号链接逐一校验", async () => {
    const assets = path.join(dir, "Personal/菜单/assets");
    await fs.mkdir(assets, { recursive: true });
    await fs.writeFile(path.join(assets, "汤.jpg"), jpg);
    await fs.writeFile(path.join(assets, "text.jpg"), "text");
    await fs.writeFile(path.join(dir, "outside.jpg"), jpg);
    await fs.symlink(path.join(dir, "outside.jpg"), path.join(assets, "symlink.jpg"));
    const read = (name: string) => request("assets", name);
    const valid = await read("汤.jpg");
    expect(valid.status).toBe(200);
    expect(Object.fromEntries(valid.headers)).toMatchObject({
      "content-type": "image/jpeg", "x-content-type-options": "nosniff", "content-disposition": "inline", "cache-control": "no-store",
    });
    expect(new Uint8Array(await valid.arrayBuffer())).toEqual(jpg);
    expect((await read("symlink.jpg")).status).toBe(404);
    expect((await read("text.jpg")).status).toBe(404);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KZ_ALLOW_LOCAL_VAULT", "");
    expect((await read("汤.jpg")).status).toBe(404);
    vi.stubEnv("KZ_ALLOW_LOCAL_VAULT", "1");
    expect((await read("汤.jpg")).status).toBe(200);
    await fs.rename(assets, path.join(dir, "moved"));
    await fs.symlink(path.join(dir, "moved"), assets);
    expect((await read("汤.jpg")).status).toBe(404);
  });
});

describe("菜谱写入", () => {
  it("零成员账号经网页增删改，封面经登录检查、原子写入与魔数校验", async () => {
    vi.stubEnv("DATABASE_URL", "offline");
    vi.spyOn(fs, "statfs").mockResolvedValue({ bavail: 10_000_000, bsize: 4096 } as Awaited<ReturnType<typeof fs.statfs>>);
    const fixture = kitchenDb();
    const repo = new PgRepository(fixture.db, "cook", newDek());
    session.userRepository.mockResolvedValue(repo);
    const input = form({ title: "Peas", body: steps });
    try {
      input.set("cover_file", new File([jpg], "cover.txt", { type: "text/plain" }));
      expect(await saveRecipeAction(input)).toEqual({ slug: "Peas" });
      const cover = `assets/Peas-${sha256(Buffer.from(jpg)).slice(0, 8)}.jpg`;
      expect(await repo.getRecipe("Peas")).toMatchObject({ cover });
      session.requireUser.mockRejectedValueOnce(new Error("login"));
      await expect(request(...cover.split("/"))).rejects.toThrow("login");
      const response = await request(...cover.split("/"));
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpg);
      expect(session.requireUser).toHaveBeenCalledTimes(2);
      await repo.putHouseholdAttachment("菜单/assets/fake.png", Buffer.from("text"), "image/png");
      expect((await request("assets", "fake.png")).status).toBe(404);
      input.delete("cover_file");
      input.set("slug", "Peas");
      input.set("body", "Cool.");
      expect(await saveRecipeAction(input)).toEqual({ slug: "Peas" });
      expect(await repo.getRecipe("Peas")).toMatchObject({ cover, body: "Cool." });
      await expect(deleteRecipeAction("Peas")).rejects.toThrow("redirect /kitchen");
      expect(await repo.listRecipes()).toEqual([]);
      expect(await repo.listMemberStubs()).toEqual([]);
    } finally { fixture.close(); }
  });

  it("超过 2 MiB 或魔数不符时不进入写事务", async () => {
    const applyChanges = vi.fn();
    session.userRepository.mockResolvedValue({ userId: "cook", applyChanges });
    const input = form({ title: "Peas", body: steps });
    input.set("cover_file", new File(["text"], "cover.png", { type: "image/png" }));
    expect(await saveRecipeAction(input)).toEqual({ error: "coverType" });
    input.set("cover_file", new File([new Uint8Array(MAX_RECIPE_COVER_BYTES + 1)], "cover.jpg"));
    expect(await saveRecipeAction(input)).toEqual({ error: "coverSize" });
    expect(applyChanges).not.toHaveBeenCalled();
  });
});
