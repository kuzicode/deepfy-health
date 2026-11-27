import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rawToFiles } from "../core/serialize";
import { loadVault, readVaultRaw } from "../core/vault";
import { recipeTemplates } from "../core/recipe-templates";
import { localAttachments, localHouseholdAttachments, planPull, pull, push, type Remote } from "./sync";

const SAMPLE = path.resolve(import.meta.dirname, "../../examples/sample-vault/Personal");
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function tempCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kzh-pull-"));
  fs.cpSync(SAMPLE, dir, { recursive: true });
  for (const [rel, content] of Object.entries(recipeTemplates(path.resolve(import.meta.dirname, "../.."), ""))) {
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

const remoteOf = (patch?: (r: Remote) => void): Remote => {
  const r: Remote = { vault: readVaultRaw(SAMPLE), attachments: [] };
  patch?.(r);
  return r;
};

describe("planPull", () => {
  it("与本地一致时什么都不写", () => {
    const plan = planPull(remoteOf(), tempCopy(), { stamp: "t" });
    expect(plan.steps).toEqual([]);
  });

  it("云端记录 key 越界：在任何写入前中止", () => {
    const into = tempCopy();
    const r = remoteOf((x) => x.vault.docs.kz.push({ kind: "record", key: "../../../../escaped", data: { date: "2026-01-01" }, body: "" }));
    expect(() => planPull(r, into, { stamp: "t" })).toThrow("路径越界");
  });

  it("云端附件路径越界：中止", () => {
    const r = remoteOf((x) => x.attachments.push({ member: "kz", relPath: "attachments/../../../../x.pdf", sha256: "0" }));
    expect(() => planPull(r, tempCopy(), { stamp: "t" })).toThrow("路径越界");
  });

  it("内容不同的文档与附件默认进 _conflicts，本地原件不动；加载器不会读到冲突副本", () => {
    const into = tempCopy();
    const att = path.join(into, "KZ/Health/attachments/report.pdf");
    fs.mkdirSync(path.dirname(att), { recursive: true });
    fs.writeFileSync(att, "本地原始报告");
    const r = remoteOf((x) => {
      x.vault.docs.kz.find((d) => d.kind === "profile")!.body = "云端改过的正文";
      x.attachments.push({ member: "kz", relPath: "attachments/report.pdf", sha256: sha("云端版本") });
    });
    const plan = planPull(r, into, { stamp: "t" });
    expect(plan.steps.map((s) => [s.rel, s.conflict, path.relative(into, s.target)])).toEqual([
      ["KZ/Health/profile.md", true, "_conflicts/t/KZ/Health/profile.md"],
      ["KZ/Health/attachments/report.pdf", true, "_conflicts/t/KZ/Health/attachments/report.pdf"],
    ]);
    for (const st of plan.steps) {
      fs.mkdirSync(path.dirname(st.target), { recursive: true });
      fs.writeFileSync(st.target, st.content ?? "云端版本");
    }
    expect(fs.readFileSync(att, "utf8")).toBe("本地原始报告");
    const s = loadVault(into);
    expect(s.issues).toEqual([]);
    expect(s.members.find((m) => m.id === "kz")!.records).toHaveLength(3);
  });

  it("--overwrite 时直接写回原位置", () => {
    const into = tempCopy();
    const r = remoteOf((x) => { x.vault.docs.kz.find((d) => d.kind === "profile")!.body = "云端改过的正文"; });
    const plan = planPull(r, into, { stamp: "t", overwrite: true });
    expect(plan.steps.map((s) => [s.conflict, path.relative(into, s.target)])).toEqual([[false, "KZ/Health/profile.md"]]);
  });
});

describe("localAttachments", () => {
  it("push 时收集日志引用的照片（不只检测记录）", () => {
    const dir = tempCopy();
    const log = path.join(dir, "KZ/Health/logs/20261028-2230.md");
    fs.writeFileSync(log, fs.readFileSync(log, "utf8").replace("attachments: []", "attachments: [attachments/logs/eye.jpg]"));
    fs.mkdirSync(path.join(dir, "KZ/Health/attachments/logs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "KZ/Health/attachments/logs/eye.jpg"), Buffer.from([0xff, 0xd8, 0xff]));
    const atts = localAttachments(dir, readVaultRaw(dir));
    expect(atts.map((a) => a.relPath)).toContain("attachments/logs/eye.jpg");
  });
});

const cover = "菜单/assets/测试面.png";
const picture = Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0x42]);
const recipeRemote = (): Remote => ({
  vault: { family: { members: [] }, docs: {}, customCatalog: [], householdDocs: [{
    kind: "recipe", key: "测试面", data: { title: "测试面", cover: "assets/测试面.png" }, body: "参考 [[手擀面]]\n",
  }] },
  householdAttachments: [{ relPath: cover, sha256: crypto.createHash("sha256").update(picture).digest("hex") }], attachments: [],
});

const scratch: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const dir of scratch.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function offlineCredentials() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kzh-sync-"));
  scratch.push(dir);
  fs.mkdirSync(path.join(dir, "kzh"));
  fs.writeFileSync(path.join(dir, "kzh/credentials.json"), JSON.stringify({ server: "https://sync.invalid", token: "test" }));
  vi.stubEnv("XDG_CONFIG_HOME", dir);
  return dir;
}

it("从空目录拉取菜谱、封面与实际可用的 Base，冲突副本不覆盖本地，模板始终保留", async () => {
  const dir = offlineCredentials();
  const into = path.join(dir, "Personal");
  fs.mkdirSync(path.join(dir, ".obsidian"));
  const remote = recipeRemote();
  const route = "/api/v1/household-attachments/" + cover;
  vi.stubGlobal("fetch", async (url: URL) => {
    if (url.pathname === "/api/v1/export") return Response.json(remote);
    expect(decodeURIComponent(url.pathname)).toBe(route);
    return new Response(picture);
  });
  const first = await pull(into, {});
  expect(first.conflicts).toEqual([]);
  expect(readVaultRaw(into).householdDocs).toMatchObject([{ body: "参考 [[手擀面]]\n" }]);
  expect(fs.readFileSync(path.join(into, cover))).toEqual(picture);
  const base = path.join(into, "菜单/菜单库.base");
  const index = path.join(into, "菜单/菜单.md");
  const view = YAML.parse(fs.readFileSync(base, "utf8"));
  expect(view.filters.and).toContain('file.folder == "Personal/菜单"');
  expect(view.views.map((v: { type: string }) => v.type)).toContain("table");
  expect(fs.readFileSync(index, "utf8")).toContain("![[Personal/菜单/菜单库.base]]");
  fs.writeFileSync(base, "custom view");
  fs.writeFileSync(index, "自定义索引");
  const recipe = path.join(into, "菜单/测试面.md");
  fs.appendFileSync(recipe, "本地改动");
  fs.writeFileSync(path.join(into, cover), "local cover");
  remote.vault.householdDocs![0].body = "远端改动";
  const plan = planPull(remote, into, { stamp: "t" });
  expect(plan.steps.map((s) => path.relative(into, s.target))).toEqual(["_conflicts/t/菜单/测试面.md", "_conflicts/t/" + cover]);
  await pull(into, {});
  expect(fs.readFileSync(recipe, "utf8")).toContain("本地改动");
  const [stamp] = fs.readdirSync(path.join(into, "_conflicts"));
  expect(fs.readFileSync(path.join(into, "_conflicts", stamp, "菜单/测试面.md"), "utf8")).toContain("远端改动");
  await pull(into, { overwrite: true });
  expect(fs.readFileSync(index, "utf8")).toBe("自定义索引");
  expect(fs.readFileSync(base, "utf8")).toBe("custom view");
});

it("家庭附件路径越界或目标经符号链接指向其他目录时不读写", () => {
  const root = offlineCredentials();
  const into = path.join(root, "Personal");
  fs.mkdirSync(into);
  const remote = recipeRemote();
  fs.symlinkSync(root, path.join(into, "菜单"));
  expect(() => planPull(remote, into, { stamp: "t" })).toThrow("路径越界");
  fs.unlinkSync(path.join(into, "菜单"));
  remote.householdAttachments![0].relPath = "菜单/assets/../../family.yaml";
  expect(() => planPull(remote, into, { stamp: "t" })).toThrow("不合法");
});

it.each([true, false])("push 上传家庭图片成功=%s，导入顺序与失败中止", async (succeeds) => {
  offlineCredentials();
  const dir = tempCopy();
  scratch.push(dir);
  const raw = readVaultRaw(dir);
  const [local] = localHouseholdAttachments(dir, raw);
  expect(local.relPath).toBe("菜单/assets/番茄炖牛腩.png");
  const memberFile = "attachments/logs/test.jpg";
  const log = path.join(dir, "KZ/Health/logs/20261028-2230.md");
  fs.writeFileSync(log, fs.readFileSync(log, "utf8").replace("attachments: []", `attachments: [${memberFile}]`));
  fs.mkdirSync(path.join(dir, "KZ/Health/attachments/logs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "KZ/Health", memberFile), picture);
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
    const route = decodeURIComponent(url.pathname);
    calls.push(init.method + " " + route);
    if (route.endsWith("export")) return Response.json({ vault: raw, attachments: [], householdAttachments: [] });
    if (!succeeds && init.method === "PUT") return new Response("test upload failed", { status: 503 });
    return Response.json({});
  });
  const expected = ["GET /api/v1/export", "PUT /api/v1/household-attachments/" + local.relPath];
  if (succeeds) {
    await expect(push(dir, {})).resolves.toMatchObject({ ok: true });
    expect(calls.slice(0, 3)).toEqual([...expected, "POST /api/v1/import"]);
    expect(calls.slice(3)).toContain("PUT /api/v1/attachments/kz/" + memberFile);
  } else {
    await expect(push(dir, {})).rejects.toThrow("503");
    expect(calls).toEqual(expected);
  }
});

function pushFixture(remote: Remote) {
  const into = path.join(offlineCredentials(), "Personal");
  for (const [rel, text] of Object.entries(rawToFiles(remote.vault))) {
    const file = path.join(into, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    fs.utimesSync(file, new Date("2025-01-01"), new Date("2025-01-01"));
  }
  fs.mkdirSync(path.dirname(path.join(into, cover)), { recursive: true });
  fs.writeFileSync(path.join(into, cover), picture);
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
    requests.push(init.method + " " + decodeURIComponent(url.pathname + url.search));
    return Response.json(url.pathname.endsWith("/export") ? remote : {});
  });
  return { into, requests };
}

it.each([true, false])("旧服务端缺少家庭附件清单时中止推送（有封面=%s）", async (hasCover) => {
  const remote = recipeRemote();
  delete remote.householdAttachments;
  if (!hasCover) delete remote.vault.householdDocs![0].data.cover;
  const { into, requests } = pushFixture(remote);
  await expect(push(into, { force: true })).rejects.toThrow(/服务端.*不支持.*菜谱/);
  expect(requests).toEqual(["GET /api/v1/export"]);
});

it("没有本地菜谱时仍可向旧服务端推送", async () => {
  const remote = recipeRemote();
  delete remote.householdAttachments;
  delete remote.vault.householdDocs;
  const { into, requests } = pushFixture(remote);
  await push(into, {});
  expect(requests).toEqual(["GET /api/v1/export", "POST /api/v1/import"]);
});

it.each([
  { force: false, secondTime: "2025-01-02", upload: false },
  { force: true, secondTime: "2025-01-02", upload: true },
  { force: false, secondTime: "2025-01-01", upload: true },
])("共用封面的菜谱按时间与 force 决定上传 $force / $secondTime", async ({ force, secondTime, upload }) => {
  const remote = recipeRemote();
  const docs = remote.vault.householdDocs!;
  docs.push({ ...docs[0], key: "汤面" });
  const { into, requests } = pushFixture(remote);
  docs[0].updatedAt = "2025-01-03T00:00:00Z";
  docs[1].updatedAt = new Date(secondTime).toISOString();
  for (const doc of docs) doc.body = "云端有不同的步骤";
  remote.householdAttachments![0].sha256 = sha("云端已换图");
  await push(into, { force });
  expect(requests).toEqual([
    "GET /api/v1/export", ...(upload ? ["PUT /api/v1/household-attachments/" + cover] : []),
    "POST /api/v1/import" + (force ? "?force=1" : ""),
  ]);
});

it("计划拒绝仅大小写不同的封面目标", () => {
  const into = path.join(offlineCredentials(), "Personal");
  const remote = recipeRemote();
  remote.householdAttachments = ["Soup", "soup"].map((name) => ({ relPath: `菜单/assets/${name}.png`, sha256: sha(name) }));
  expect(() => planPull(remote, into, { stamp: "t" })).toThrow(/大小写/);
  expect(fs.existsSync(into)).toBe(false);
});

it.each(["下载失败", "哈希不匹配"])("最后一张封面%s时，正文、已下载附件和原件均不落盘变动", async (failure) => {
  const into = path.join(offlineCredentials(), "Personal");
  fs.mkdirSync(into);
  fs.writeFileSync(path.join(into, "family.yaml"), "本地原件");
  const remote = recipeRemote();
  remote.householdAttachments!.push({ relPath: "菜单/assets/末张.png", sha256: sha("清单中的内容") });
  const downloaded: string[] = [];
  vi.stubGlobal("fetch", async (url: URL) => {
    if (url.pathname.endsWith("/export")) return Response.json(remote);
    const route = decodeURIComponent(url.pathname);
    downloaded.push(route);
    if (route.endsWith(cover)) return new Response(picture);
    return failure === "下载失败" ? new Response("failed", { status: 503 }) : new Response("内容已变化");
  });
  await expect(pull(into, { overwrite: true })).rejects.toThrow(failure === "下载失败" ? /503/ : /SHA-256/i);
  expect(downloaded).toEqual([cover, "菜单/assets/末张.png"].map((rel) => "/api/v1/household-attachments/" + rel));
  expect(fs.readdirSync(into)).toEqual(["family.yaml"]);
  expect(fs.readFileSync(path.join(into, "family.yaml"), "utf8")).toBe("本地原件");
});

it("成员附件也须通过 manifest 哈希校验，失败后不创建目标目录", async () => {
  const into = path.join(offlineCredentials(), "Personal");
  const remote = remoteOf((r) => r.attachments.push({ member: "kz", relPath: "attachments/test.pdf", sha256: sha("expected") }));
  vi.stubGlobal("fetch", async (url: URL) => url.pathname.endsWith("/export") ? Response.json(remote) : new Response("different"));
  await expect(pull(into, {})).rejects.toThrow(/SHA-256/i);
  expect(fs.existsSync(into)).toBe(false);
});
