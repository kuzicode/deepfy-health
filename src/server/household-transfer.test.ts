import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { kitchenDb } from "@/test/kitchen-db";
import { GET as archive } from "@/../app/(app)/settings/export/route";
import { GET as manifest } from "@/../app/api/v1/export/route";
import { GET, PUT } from "@/../app/api/v1/household-attachments/[...path]/route";
import { newDek, sha256 } from "./crypto";
import { PgRepository } from "./pg-repository";

let fixture: ReturnType<typeof kitchenDb>;
let repo: PgRepository;
let dir: string;
const uid = "kitchen-user";
const rel = "菜单/assets/豌豆.png";
const ctx = { params: Promise.resolve({ path: rel.split("/") }) };
const image = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 9]);

vi.mock("@/db/client", () => ({ getDb: () => fixture.db }));
vi.mock("./tokens", () => ({ tokenAuth: (_db: unknown, header: string | null) =>
  header && { userId: header === "Bearer other" ? "other" : uid, domains: null, scope: header.slice(7) } }));
vi.mock("./session", () => ({ getSession: () => ({ user: { id: uid } }), userRepository: () => repo }));

beforeEach(async () => {
  fixture = kitchenDb();
  const kek = newDek();
  repo = new PgRepository(fixture.db, uid, kek);
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "household-transfer-"));
  vi.stubEnv("KZ_MASTER_KEY", kek.toString("base64"));
  vi.stubEnv("KZ_ATTACHMENT_DIR", dir);
  vi.stubEnv("KZ_EDITION", "self");
  vi.spyOn(fs, "statfs").mockResolvedValue({ bavail: 10_000_000, bsize: 4096 } as Awaited<ReturnType<typeof fs.statfs>>);
});
afterEach(async () => {
  fixture.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

const get = (scope: string) => new Request("https://fixture.invalid", { headers: { authorization: "Bearer " + scope } });
const put = (scope: string, length = image.length) => new Request("https://fixture.invalid", {
  method: "PUT", body: image, headers: { authorization: "Bearer " + scope, "content-type": "image/png", "content-length": String(length) },
});

it("同步权限与体积限制由家庭附件路由落实，读取仅限所属账号", async () => {
  expect((await PUT(put("write"), ctx)).status).toBe(403);
  expect((await PUT(put("sync", 25 * 1024 * 1024 + 1), ctx)).status).toBe(413);
  expect((await PUT(put("sync"), ctx)).status).toBe(200);
  expect((await GET(get("other"), ctx)).status).toBe(404);
  const res = await GET(get("read"), ctx);
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(image);
});

it("导出清单与 ZIP 都含封面，ZIP 路径与两份 Obsidian 模板一致", async () => {
  await PUT(put("sync"), ctx);
  await repo.applyChanges([{ op: "create_household", kind: "recipe", key: "豌豆", data: { title: "豌豆", cover: "assets/豌豆.png" }, body: "蒸熟。" }], { scope: "household" });
  const exported = await (await manifest(get("read"))).json();
  expect(exported.householdAttachments).toMatchObject([{ relPath: rel, sha256: sha256(Buffer.from(image)) }]);
  expect(exported.vault.householdDocs).toMatchObject([{ body: "蒸熟。" }]);
  const zip = unzipSync(new Uint8Array(await (await archive()).arrayBuffer()));
  expect(zip["Personal/" + rel]).toEqual(image);
  const content = (name: string) => new TextDecoder().decode(zip["Personal/菜单/" + name]);
  expect(content("豌豆.md")).toContain("蒸熟。");
  expect(content("菜单.md")).toContain("![[Personal/菜单/菜单库.base]]");
  expect(content("菜单库.base")).toContain('file.folder == "Personal/菜单"');
});
