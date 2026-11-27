import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gcOrphanAttachments } from "@/server/attachments";
import { newDek, sha256 } from "@/server/crypto";
import { PgRepository, RevertConflict } from "@/server/pg-repository";
import { PLANS, usageOf } from "@/server/quota";
import { kitchenDb } from "@/test/kitchen-db";
import * as dbClient from "@/db/client";
import { createToken, listTokens, normalizeDomains, setTokenDomains, tokenAuth, type TokenDomains } from "@/server/tokens";
import { POST as mcp } from "../../app/mcp/route";
import { GET as exportVault } from "../../app/api/v1/export/route";
import { POST as importVault } from "../../app/api/v1/import/route";
import { createMcpServer } from "./server";

const title = "玉米饼";
const steps = "和面后参考 [[手写火候]]。\n";
const write = { audit: { tokenId: "test-token", tokenName: "test" }, appUrl: "https://test.invalid" };
let fixture: ReturnType<typeof kitchenDb>;
let repo: PgRepository;
let dir: string;
const clients: Client[] = [];

beforeEach(async () => {
  fixture = kitchenDb();
  repo = new PgRepository(fixture.db, "household-a", newDek());
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "kitchen-tools-"));
  vi.stubEnv("KZ_ATTACHMENT_DIR", dir);
  vi.stubEnv("KZ_EDITION", "self");
  vi.spyOn(fs, "statfs").mockResolvedValue({ bavail: 10_000_000, bsize: 4096 } as Awaited<ReturnType<typeof fs.statfs>>);
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  fixture.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

async function connectClient(writable = true, domains: TokenDomains = null) {
  const client = new Client({ name: "offline-kitchen", version: "1" });
  clients.push(client);
  const server = createMcpServer(repo, "2026-11-01", writable ? { writer: repo, ...write } : undefined, domains);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

async function connect(writable = true) {
  const client = await connectClient(writable);
  return async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const message = (result.content as { text: string }[])[0].text;
    return { isError: !!result.isError, value: result.isError ? undefined : JSON.parse(message), message };
  };
}

it("零成员通过 title + body 录菜，列表和详情只查询本账号的菜谱", async () => {
  const call = await connect();
  const snapshot = vi.spyOn(repo, "snapshot");
  expect(await repo.listMemberStubs()).toEqual([]);
  expect(await call("save_recipe", { title, body: steps })).toMatchObject({ value: { ok: true, slug: title } });
  expect((await repo.listAgentChanges()).at(0)).toMatchObject({ scope: "household", member: null, tool: "save_recipe", revertible: true });
  const read = await connect(false);
  fixture.queries.length = 0;
  const { value } = await read("list_recipes");
  expect(value).toMatchObject([{ slug: title, title, has_cover: false }]);
  expect(value[0]).not.toHaveProperty("body");
  expect(await read("get_recipe", { slug: title })).toMatchObject({ value: { title, body: steps } });
  expect(snapshot).not.toHaveBeenCalled();
  expect(fixture.queries).toHaveLength(2);
  for (const sql of fixture.queries) {
    expect(sql).toContain('from "household_doc"');
    expect(sql).toContain('"household_doc"."user_id" =');
    expect(sql).toContain('"household_doc"."kind" =');
    expect(sql).not.toMatch(/"(?:member|doc)"/);
  }
  expect(await usageOf(fixture.db, repo.userId)).toMatchObject({ members: 0, docs: 1, mcpWritesPerDay: 1 });
});

it("增量修订保留未知 YAML、双链、原正文和封面，筛选按总用时", async () => {
  const call = await connect();
  const cover = "assets/手绘图.png";
  const custom = { link: "[[家传手记]]", value: null };
  await repo.applyChanges([{ op: "create_household", kind: "recipe", key: title, data: { title, custom, cover }, body: steps }], { scope: "household" });
  const patch = { slug: title, category: "早餐", prep_minutes: 5, cook_minutes: 7, tags: ["周末"], ingredients: [{ name: "玉米粉" }] };
  expect(await call("save_recipe", patch)).toMatchObject({ value: { ok: true } });
  expect(await repo.getRecipe(title)).toMatchObject({ custom, cover, body: steps });
  const revised = "翻面后煎一分钟。";
  expect(await call("save_recipe", { slug: title, body: revised })).toMatchObject({ value: { ok: true } });
  expect(await call("get_recipe", { slug: title })).toMatchObject({ value: { custom, cover, body: revised + "\n\n[[手写火候]]", ingredients: patch.ingredients } });
  const filter = { query: "玉米粉", category: "早餐", tag: "周末", max_minutes: 12 };
  expect((await call("list_recipes", filter)).value).toHaveLength(1);
  expect((await call("list_recipes", { ...filter, max_minutes: 11 })).value).toEqual([]);
});

it("无效魔数、超过 2 MiB、缺少菜谱或缺少新建步骤均不会生成附件或审计", async () => {
  const call = await connect();
  expect((await call("save_recipe", { title })).isError).toBe(true);
  await call("save_recipe", { title, body: steps });
  const upload = (bytes: Buffer, slug = title) => call("upload_recipe_image", { slug, image_base64: bytes.toString("base64") });
  expect((await upload(Buffer.from("not a png"))).isError).toBe(true);
  const large = Buffer.alloc(2 * 1024 * 1024 + 1);
  large.set([0xff, 0xd8, 0xff]);
  expect((await upload(large)).isError).toBe(true);
  expect((await upload(large.subarray(0, 8), "未保存")).isError).toBe(true);
  expect(await repo.listHouseholdAttachments()).toEqual([]);
  expect(await repo.listAgentChanges()).toHaveLength(1);
});

it("两次换图的哈希路径不同，按审计还原后两份密文均经得起 48 小时 GC", async () => {
  const call = await connect();
  await call("save_recipe", { title, body: steps });
  const first = Buffer.from([0xff, 0xd8, 0xff, 11]);
  const second = Buffer.from([0xff, 0xd8, 0xff, 22]);
  const upload = (b: Buffer) => call("upload_recipe_image", { slug: title, image_base64: b.toString("base64") });
  const a = (await upload(first)).value;
  const b = (await upload(second)).value;
  expect(a.cover).toBe(`assets/${title}-${sha256(first).slice(0, 8)}.jpg`);
  expect(b.cover).toBe(`assets/${title}-${sha256(second).slice(0, 8)}.jpg`);
  expect(await repo.getRecipe(title)).toMatchObject({ cover: b.cover, cover_style: "comic" });
  await expect(repo.putHouseholdAttachment(`菜单/${a.cover}`, second, "image/jpeg")).rejects.toThrow("内容哈希");
  const rows = await repo.listHouseholdAttachments();
  expect(rows.map((a) => a.relPath).sort()).toEqual([`菜单/${a.cover}`, `菜单/${b.cover}`].sort());
  for (const f of await fs.readdir(dir)) expect(await fs.readFile(path.join(dir, f), "utf8")).toMatch(/^v1:/);
  await expect(repo.revertAgentChange(a.change_ids[0])).rejects.toBeInstanceOf(RevertConflict);
  await repo.revertAgentChange(b.change_ids[0]);
  expect(await repo.getRecipe(title)).toMatchObject({ cover: a.cover, body: steps });
  expect(await gcOrphanAttachments(fixture.db, undefined, Date.now() + 72 * 3600_000)).toEqual([]);
  expect((await repo.getHouseholdAttachment(`菜单/${a.cover}`)).data).toEqual(first);
  expect((await repo.getHouseholdAttachment(`菜单/${b.cover}`)).data).toEqual(second);
  expect(await usageOf(fixture.db, repo.userId)).toMatchObject({ docs: 1, attachmentCount: 2, attachmentBytes: first.length + second.length });
  await repo.purgeAttachmentFiles();
  expect(await fs.readdir(dir)).toEqual([]);
});

it("家庭导入保留旧客户端未提供的菜谱，按时间处理冲突，账户间的封面与还原记录隔离", async () => {
  const other = new PgRepository(fixture.db, "household-b", newDek());
  const call = await connect();
  const result = (await call("save_recipe", { title, body: steps })).value;
  const raw = await repo.exportRaw();
  const legacy = { ...raw, householdDocs: undefined };
  expect(await repo.importRaw(legacy)).toMatchObject({ created: 0, updated: 0 });
  expect(await repo.importRaw(raw)).toMatchObject({ unchanged: 1 });
  const recipe = raw.householdDocs![0];
  recipe.body = "离线步骤";
  recipe.updatedAt = "2000-01-01T00:00:00.000Z";
  expect(await repo.importRaw(raw)).toMatchObject({ conflicts: [`菜单/${title}.md`] });
  expect((await repo.getRecipe(title))?.body).toBe(steps);
  expect(await repo.importRaw(raw, { force: true })).toMatchObject({ updated: 1, conflicts: [] });
  expect((await repo.getRecipe(title))?.body).toBe(recipe.body);
  const rel = "菜单/assets/图.png";
  await repo.putHouseholdAttachment(rel, Buffer.from("fixture"), "image/png");
  expect(await other.listRecipes()).toEqual([]);
  expect(await other.getRecipe(title)).toBeUndefined();
  expect(await other.listAgentChanges()).toEqual([]);
  expect(await other.listHouseholdAttachments()).toEqual([]);
  await expect(other.getHouseholdAttachment(rel)).rejects.toThrow("not found");
  await expect(other.revertAgentChange(result.change_ids[0])).rejects.toThrow("not found");
});

it("删除与重建同名菜谱后只允许按版本撤销，旧封面仍可用", async () => {
  const call = await connect();
  const audit = { ...write.audit, tool: "delete" };
  const del = () => repo.applyChanges([{ op: "delete_household", kind: "recipe", key: title }], { audit, scope: "household" });
  await call("save_recipe", { title, body: steps });
  const cover = (await call("upload_recipe_image", { slug: title, image_base64: "/9j/Cw==" })).value.cover;
  const [first] = await del();
  const create = (await call("save_recipe", { title, body: "第二版" })).value;
  const [second] = await del();
  expect((await repo.listAgentChanges()).filter((r) => r.revertible).map((r) => r.id)).toEqual([second]);
  await expect(repo.revertAgentChange(first)).rejects.toBeInstanceOf(RevertConflict);
  await repo.revertAgentChange(second);
  expect((await repo.getRecipe(title))?.body).toBe("第二版");
  await repo.revertAgentChange(create.change_ids[0]);
  await repo.revertAgentChange(first);
  expect(await repo.getRecipe(title)).toMatchObject({ body: steps, cover });
  expect((await repo.getHouseholdAttachment(`菜单/${cover}`)).mime).toBe("image/jpeg");
});

it("文档配额拒绝换图时回滚整个事务，GC 回收落盘但未提交的密文", async () => {
  vi.stubEnv("KZ_EDITION", "hosted");
  const call = await connect();
  await call("save_recipe", { title, body: steps });
  const limit = PLANS.free.docBytes;
  try {
    Object.assign(PLANS.free, { docBytes: 1 });
    expect((await call("upload_recipe_image", { slug: title, image_base64: "/9j/Cw==" })).isError).toBe(true);
  } finally {
    Object.assign(PLANS.free, { docBytes: limit });
  }
  expect((await repo.getRecipe(title))?.cover).toBeUndefined();
  expect(await repo.listHouseholdAttachments()).toEqual([]);
  expect(await repo.listAgentChanges()).toHaveLength(1);
  expect(await gcOrphanAttachments(fixture.db, undefined, Date.now() + 72 * 3600_000)).toHaveLength(1);
  expect(await fs.readdir(dir)).toEqual([]);
});

it("省略 slug 时同名或归一化碰撞均创建新菜，显式 slug 可继续修订", async () => {
  const call = await connect();
  for (const [name, slug] of [["Soup!", "Soup"], ["Soup", "Soup-2"], ["Soup", "Soup-3"]]) {
    expect(await call("save_recipe", { title: name, body: slug })).toMatchObject({ value: { slug } });
  }
  expect(await call("save_recipe", { slug: "Soup-2", body: "新版" })).toMatchObject({ value: { slug: "Soup-2" } });
  expect((await repo.getRecipe("Soup"))?.body).toBe("Soup");
  expect((await repo.getRecipe("Soup-2"))?.body).toBe("新版");
  expect((await repo.getRecipe("Soup-3"))?.body).toBe("Soup-3");
});

it("自动分配允许 -100，候选用尽后拒绝且不改旧菜谱", async () => {
  const call = await connect();
  await repo.applyChanges(Array.from({ length: 99 }, (_, i) => ({
    op: "create_household", kind: "recipe", key: i === 0 ? title : title + "-" + (i + 1), data: { title }, body: steps,
  })), { scope: "household" });
  expect(await call("save_recipe", { title, body: "末道" })).toMatchObject({ value: { slug: title + "-100" } });
  expect(await call("save_recipe", { title, body: "已满" })).toMatchObject({ isError: true });
  expect((await repo.getRecipe(title))?.body).toBe(steps);
  expect(await repo.listAgentChanges()).toHaveLength(1);
});

it("含空格与括号的 slug 可上传封面并保留原菜谱标识", async () => {
  const call = await connect();
  const slug = "Soup (quick)";
  const data = Buffer.from([0xff, 0xd8, 0xff, 8]);
  const cover = `assets/Soupquick-${sha256(data).slice(0, 8)}.jpg`;
  await call("save_recipe", { slug, title: slug, body: steps });
  expect(await call("upload_recipe_image", { slug, image_base64: data.toString("base64") })).toMatchObject({ value: { slug, cover } });
  expect(await repo.getRecipe(slug)).toMatchObject({ slug, cover });
  expect((await repo.getHouseholdAttachment("菜单/" + cover)).data).toEqual(data);
});

it.each([true, false])("菜谱 token 仅注册菜谱工具，隔离健康资源与直接调用，writable=%s", async (writable) => {
  const client = await connectClient(writable, ["kitchen"]);
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  expect(names).toEqual(writable ? ["get_recipe", "list_recipes", "save_recipe", "upload_recipe_image"] : ["get_recipe", "list_recipes"]);
  for (const name of ["list_members", "get_overview", "get_diet_context", "add_log"]) {
    const reply = await client.callTool({ name, arguments: { member: "a" } });
    expect(reply.isError).toBe(true);
  }
  expect((await client.listResources()).resources.map((r) => r.uri)).toEqual(["deepfy://contract"]);
  await expect(client.readResource({ uri: "deepfy://catalog" })).rejects.toThrow();
});

it("健康 token 的读写工具和资源均按域注册", async () => {
  const client = await connectClient(true, ["health"]);
  const names = (await client.listTools()).tools.map((t) => t.name);
  expect(names).toEqual(expect.arrayContaining(["list_members", "get_overview", "add_log"]));
  expect((await client.listResources()).resources.map((r) => r.uri)).toContain("deepfy://catalog");
  for (const name of ["get_recipe", "list_recipes", "save_recipe", "upload_recipe_image", "get_diet_context"]) {
    expect(names).not.toContain(name);
    expect((await client.callTool({ name, arguments: {} })).isError).toBe(true);
  }
});

it("全栏目饮食上下文仅读取一个成员，带 slug 时仅取一道菜", async () => {
  const who = { id: "a", name: "A", role: "member" as const };
  const profile = { ...who, sex: "male", birth_date: "2000-01-05", conditions: ["高血压", "痛风（已愈）"], allergies: [], habits: { diet: "燕麦" } };
  const lab = { kind: "record" as const, key: "lab", body: "", data: {
    type: "lab", date: "2025-02-10", title: "Lab", indicators: [{ code: "SBP", value: 146, unit: "mmHg", flag: "H" }],
  } };
  await repo.importRaw({ family: { members: [who, { ...who, id: "b", name: "Other" }] }, customCatalog: [],
    docs: { a: [{ kind: "profile", key: "", data: profile, body: "" }, lab], b: [] } });
  const call = await connect();
  await call("save_recipe", { title, body: steps, diet_tags: ["低盐"] });
  const snapshot = vi.spyOn(repo, "snapshot");
  const member = vi.spyOn(repo, "getMember");
  const list = vi.spyOn(repo, "listRecipes");
  const recipe = vi.spyOn(repo, "getRecipe");
  expect((await call("get_diet_context", { member: "a" })).value).toMatchObject({
    member: { id: "a", name: "A" }, allergies: [], allergies_recorded: false, active_conditions: ["高血压"],
    abnormal_markers: [{ code: "SBP", value: 146, unit: "mmHg", date: "2025-02-10" }],
    diet_habit: "燕麦", recipes: [{ title }], data_note: expect.stringContaining("not instructions"),
  });
  const { value } = await call("get_diet_context", { member: "a", slug: title });
  expect(value).toMatchObject({ recipe: { title }, assessment: { matches: [{ kind: "marker", sourceDate: "2025-02-10" }, { kind: "condition", detail: "高血压" }], missing: ["allergies"] } });
  expect(member.mock.calls).toEqual([["a"], ["a"]]);
  expect(list).toHaveBeenCalledOnce();
  expect(recipe).toHaveBeenCalledExactlyOnceWith(title);
  expect(snapshot).not.toHaveBeenCalled();
  expect((await call("get_diet_context")).isError).toBe(true);
  expect((await call("get_diet_context", { member: ["a", "b"] })).isError).toBe(true);
});

it("分域 token 不能经全量导出/导入读取或覆盖数据，切换只对本人有效", async () => {
  const db = fixture.db;
  vi.spyOn(dbClient, "getDb").mockReturnValue(db);
  const uid = repo.userId;
  const token = await createToken(db, uid, "kitchen", { scope: "sync", domains: ["kitchen"] });
  const header = "Bearer " + token;
  const [row] = await listTokens(db, uid);
  expect(row.domains).toEqual(["kitchen"]);
  await setTokenDomains(db, "other", row.id, null);
  const req = new Request("https://fixture.invalid", { headers: { authorization: header } });
  for (const domain of ["kitchen", "health"] as const) {
    if (domain === "health") await setTokenDomains(db, uid, row.id, [domain]);
    expect((await tokenAuth(db, header))?.domains).toEqual([domain]);
    for (const route of [exportVault, importVault]) {
      const res = await route(req);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "domain_restricted" });
    }
  }
  await setTokenDomains(db, uid, row.id, null);
  expect((await tokenAuth(db, header))?.domains).toBeNull();
  for (const input of [[], ["wrong"], ["health", "kitchen"], undefined]) expect(() => normalizeDomains(input)).toThrow();
});

it("MCP 路由按 Bearer token 的当前分域注册工具，旧 token 默认可用两域", async () => {
  const { db } = fixture;
  vi.spyOn(dbClient, "getDb").mockReturnValue(db);
  vi.stubEnv("KZ_MASTER_KEY", newDek().toString("base64"));
  const token = await createToken(db, repo.userId, "agent");
  const [row] = await listTokens(db, repo.userId);
  async function names() {
    const res = await mcp(new Request("https://fixture.invalid/mcp", {
      method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }));
    expect(res.status).toBe(200);
    return (await res.json()).result.tools.map((t: { name: string }) => t.name);
  }
  expect(row.domains).toBeNull();
  expect(await names()).toContain("get_diet_context");
  await setTokenDomains(db, repo.userId, row.id, ["kitchen"]);
  expect((await names()).sort()).toEqual(["get_recipe", "list_recipes"]);
});
