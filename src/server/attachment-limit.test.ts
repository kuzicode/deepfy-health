import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DB } from "@/db/client";
import { user } from "@/db/schema";
import { randomId } from "./crypto";
import { createToken } from "./tokens";

const URL = process.env.KZ_TEST_DATABASE_URL;

describe.skipIf(!URL)("附件上传大小（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const uid = `att-${randomId()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.KZ_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64");
    db = createDb(URL!);
    await db.insert(user).values({ id: uid, name: "x", email: `${uid}@example.com` });
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, uid));
    await db.$client.end();
  });

  it("声明超过上限的请求体在读取前就被拒绝，上限小于代理的截断阈值", async () => {
    const token = await createToken(db, uid, "t", { scope: "write" });
    const { PUT } = await import("@/../app/api/v1/attachments/[member]/[...path]/route");
    const res = await PUT(new Request("http://localhost:3000/api/v1/attachments/m/attachments/a.pdf", {
      method: "PUT", body: "x", headers: { authorization: `Bearer ${token}`, "content-length": String(25 * 1024 * 1024 + 1) },
    }), { params: Promise.resolve({ member: "m", path: ["attachments", "a.pdf"] }) });
    expect(res.status).toBe(413);
  });
});
