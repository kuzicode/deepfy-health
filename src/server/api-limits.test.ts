import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readVaultRaw } from "@/core/vault";
import { createDb, type DB } from "@/db/client";
import { doc, member, user } from "@/db/schema";
import { randomId } from "./crypto";
import { createToken } from "./tokens";

const URL = process.env.KZ_TEST_DATABASE_URL;
const SAMPLE = path.resolve(import.meta.dirname, "../../examples/sample-vault/Personal");
const BASE = "http://localhost";

describe.skipIf(!URL)("/api/v1 和 /mcp 的权限与限制（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const uid = `limits-${randomId()}`;
  const tokens = {} as Record<"read" | "write" | "sync", string>;
  const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
  const vault = JSON.stringify(readVaultRaw(SAMPLE));

  const postImport = async (token: string, init: RequestInit = {}) => {
    const { POST } = await import("../../app/api/v1/import/route");
    return POST(new Request(`${BASE}/api/v1/import`, { method: "POST", body: vault, ...init, headers: { ...bearer(token), ...init.headers } }));
  };
  const putAttachment = async (token: string) => {
    const { PUT } = await import("../../app/api/v1/attachments/[member]/[...path]/route");
    const req = new Request(`${BASE}/api/v1/attachments/kz/attachments/a.pdf`, { method: "PUT", body: new Uint8Array([1, 2, 3]), headers: bearer(token) });
    return PUT(req, { params: Promise.resolve({ member: "kz", path: ["attachments", "a.pdf"] }) });
  };
  const postMcp = async (token: string, body: unknown) => {
    const { POST } = await import("../../app/mcp/route");
    return POST(new Request(`${BASE}/mcp`, {
      method: "POST", body: JSON.stringify(body),
      headers: { ...bearer(token), "content-type": "application/json", accept: "application/json, text/event-stream" },
    }));
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.KZ_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64");
    db = createDb(URL!);
    await db.insert(user).values({ id: uid, name: uid, email: `${uid}@example.com` });
    for (const scope of ["read", "write", "sync"] as const) tokens[scope] = await createToken(db, uid, scope, { scope });
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, uid));
    await db.$client.end();
  });

  it("只有本地同步权限能整批导入和上传附件", async () => {
    for (const scope of ["read", "write"] as const) {
      const res = await postImport(tokens[scope]);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("sync_token_required");
      expect((await putAttachment(tokens[scope])).status).toBe(403);
    }
    const members = await db.select({ id: member.id }).from(member).where(eq(member.userId, uid));
    expect(members).toEqual([]);

    expect((await postImport(tokens.sync)).status).toBe(200);
    const [m] = await db.select({ id: member.id }).from(member).where(eq(member.userId, uid));
    expect(await db.select({ id: doc.id }).from(doc).where(eq(doc.memberId, m.id))).not.toEqual([]);
  });

  it("超大的导入请求在解析前就拒绝", async () => {
    const res = await postImport(tokens.sync, { body: "{}", headers: { "content-length": String(21 * 1024 * 1024) } });
    expect(res.status).toBe(413);
  });

  it("只读 token 可以导出", async () => {
    const { GET } = await import("../../app/api/v1/export/route");
    const res = await GET(new Request(`${BASE}/api/v1/export`, { headers: bearer(tokens.read) }));
    expect(res.status).toBe(200);
  });

  const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } };

  it("/mcp 拒绝批量请求，单个请求正常", async () => {
    const batch = await postMcp(tokens.read, [initialize, initialize]);
    expect(batch.status).toBe(400);
    expect((await batch.json()).error.code).toBe(-32600);
    expect((await postMcp(tokens.read, initialize)).status).toBe(200);
  });

  it("本地同步 token 在 /mcp 上没有写入工具", async () => {
    const list = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
    const names = async (t: string) => ((await (await postMcp(t, list)).json()).result.tools as { name: string }[]).map((x) => x.name);
    expect(await names(tokens.write)).toContain("add_log");
    expect(await names(tokens.sync)).not.toContain("add_log");
  });
});
