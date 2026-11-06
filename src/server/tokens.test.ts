import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DB } from "@/db/client";
import { user } from "@/db/schema";
import { newDek, randomId } from "./crypto";
import { asScope, createToken, listTokens, revealToken, revokeToken, rotateToken, setTokenScope, tokenAuth, userIdForToken } from "./tokens";

const URL = process.env.KZ_TEST_DATABASE_URL;

describe.skipIf(!URL)("接入 token（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const uid = `tok-${randomId()}`;

  beforeAll(async () => {
    db = createDb(URL!);
    await db.insert(user).values({ id: uid, name: "tok", email: `${uid}@example.com` });
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, uid));
    await db.$client.end();
  });

  it("重新生成 token：旧的立即失效、新的可用；不能重新生成别人的 token", async () => {
    const old = await createToken(db, uid, "rotate");
    const id = (await listTokens(db, uid)).find((t) => t.name === "rotate")!.id;
    expect(await rotateToken(db, "someone-else", id)).toBeUndefined();
    expect(await userIdForToken(db, `Bearer ${old}`)).toBe(uid);
    const fresh = await rotateToken(db, uid, id);
    expect(fresh).toMatch(/^kzh_/);
    expect(await userIdForToken(db, `Bearer ${old}`)).toBeUndefined();
    expect(await userIdForToken(db, `Bearer ${fresh}`)).toBe(uid);
    await revokeToken(db, uid, id);
  });

  it("token 加密保存后可再次取回（仅本人、用对的密钥）；不传 dek 的旧 token 取不回", async () => {
    const dek = newDek();
    const token = await createToken(db, uid, "reveal", { dek });
    const legacy = await createToken(db, uid, "legacy");
    const rows = await listTokens(db, uid);
    const id = rows.find((t) => t.name === "reveal")!.id;
    const legacyId = rows.find((t) => t.name === "legacy")!.id;
    expect(rows.find((t) => t.id === id)!.revealable).toBe(true);
    expect(rows.find((t) => t.id === legacyId)!.revealable).toBe(false);
    expect(await revealToken(db, uid, id, dek)).toBe(token);
    expect(await revealToken(db, "someone-else", id, dek)).toBeUndefined();
    await expect(revealToken(db, uid, id, newDek())).rejects.toThrow();
    expect(await revealToken(db, uid, legacyId, dek)).toBeUndefined();
    const fresh = await rotateToken(db, uid, legacyId, dek);
    expect(await revealToken(db, uid, legacyId, dek)).toBe(fresh);
    expect(legacy).not.toBe(fresh);
    await revokeToken(db, uid, id);
    await revokeToken(db, uid, legacyId);
  });

  it("权限：默认只读，可改为可写入；改别人的 token 无效", async () => {
    const ro = await createToken(db, uid, "scope");
    const id = (await listTokens(db, uid)).find((t) => t.name === "scope")!.id;
    expect(await tokenAuth(db, `Bearer ${ro}`)).toMatchObject({ userId: uid, tokenId: id, name: "scope", scope: "read" });
    await setTokenScope(db, "someone-else", id, "write");
    expect((await tokenAuth(db, `Bearer ${ro}`))?.scope).toBe("read");
    await setTokenScope(db, uid, id, "write");
    expect((await tokenAuth(db, `Bearer ${ro}`))?.scope).toBe("write");
    const sync = await createToken(db, uid, "scope-s", { scope: "sync" });
    expect((await tokenAuth(db, `Bearer ${sync}`))?.scope).toBe("sync");
    expect(asScope("sync")).toBe("sync");
    expect(asScope("admin")).toBe("read");
    const rw = await createToken(db, uid, "scope-w", { scope: "write" });
    expect((await tokenAuth(db, `Bearer ${rw}`))?.scope).toBe("write");
    for (const t of await listTokens(db, uid)) await revokeToken(db, uid, t.id);
  });
});
