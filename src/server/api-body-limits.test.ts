import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DB } from "@/db/client";
import { user } from "@/db/schema";
import { randomId } from "./crypto";
import { createToken } from "./tokens";

const URL = process.env.KZ_TEST_DATABASE_URL;
const BASE = "http://localhost";

/** 不带 Content-Length（分块发送）的请求不能绕过大小限制 */
describe.skipIf(!URL)("请求体大小限制（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  let token: string;
  const uid = `body-${randomId()}`;
  const chunked = (url: string, text: string, headers: HeadersInit) => new Request(url, {
    method: "POST", duplex: "half", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...headers },
    body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } }),
  } as RequestInit);

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.KZ_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64");
    db = createDb(URL!);
    await db.insert(user).values({ id: uid, name: uid, email: `${uid}@example.com` });
    token = await createToken(db, uid, "t", { scope: "sync" });
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, uid));
    await db.$client.end();
  });

  it("导入接口", async () => {
    const { POST } = await import("../../app/api/v1/import/route");
    const res = await POST(chunked(`${BASE}/api/v1/import`, JSON.stringify({ pad: "x".repeat(21 * 1024 * 1024) }), {}));
    expect(res.status).toBe(413);
  });

  it("导入接口：JSON 格式不对返回 400，不是 500", async () => {
    const { POST } = await import("../../app/api/v1/import/route");
    expect((await POST(chunked(`${BASE}/api/v1/import`, "{", {}))).status).toBe(400);
  });

  it("/mcp", async () => {
    const { POST } = await import("../../app/mcp/route");
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(6 * 1024 * 1024) } });
    const res = await POST(chunked(`${BASE}/mcp`, body, { accept: "application/json, text/event-stream" }));
    expect(res.status).toBe(413);
    expect((await res.json()).error.message).toBe("Request too large");
  });
});
