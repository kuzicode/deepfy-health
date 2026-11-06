import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readVaultRaw } from "@/core/vault";
import { createDb, type DB } from "@/db/client";
import { user } from "@/db/schema";
import { newDek, randomId } from "./crypto";
import { NotFound, PgRepository } from "./pg-repository";

const URL = process.env.KZ_TEST_DATABASE_URL;
const SAMPLE = path.resolve(import.meta.dirname, "../../examples/sample-vault/Personal");

describe.skipIf(!URL)("家人的显示顺序（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const kek = newDek();
  const ids = { a: `order-a-${randomId()}`, b: `order-b-${randomId()}` };
  let a: PgRepository;
  let b: PgRepository;
  const order = async (r: PgRepository) => (await r.snapshot()).members.map((m) => m.id);

  beforeAll(async () => {
    db = createDb(URL!);
    for (const id of Object.values(ids)) await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
    a = new PgRepository(db, ids.a, kek);
    b = new PgRepository(db, ids.b, kek);
    await a.importRaw(readVaultRaw(SAMPLE));
    await b.importRaw(readVaultRaw(SAMPLE));
  });
  afterAll(async () => {
    for (const id of Object.values(ids)) await db.delete(user).where(eq(user.id, id));
    await db.$client.end();
  });

  it("保存后快照和导出都按新顺序，不影响其他账号", async () => {
    const before = await order(a);
    const reversed = [...before].reverse();
    await a.reorderMembers(reversed);
    expect(await order(a)).toEqual(reversed);
    expect((await a.exportRaw()).family.members.map((m) => m.id)).toEqual(reversed);
    expect(await order(b)).toEqual(before);
  });

  it("新家人排在最后，再次导入不改变顺序", async () => {
    const before = await order(a);
    await a.applyChanges([{ op: "add_member", id: "m-new", name: "新", profile: { id: "m-new", name: "新", sex: "female", birth_date: "1970-01-15" } }]);
    expect(await order(a)).toEqual([...before, "m-new"]);
    await a.importRaw(readVaultRaw(SAMPLE));
    expect(await order(a)).toEqual([...before, "m-new"]);
  });

  it("名单和账号的家人不完全一致时拒绝，不改顺序", async () => {
    const before = await order(a);
    for (const bad of [before.slice(1), [...before, "someone-else"], [before[0], ...before.slice(0, -1)]]) {
      await expect(a.reorderMembers(bad)).rejects.toBeInstanceOf(NotFound);
    }
    expect(await order(a)).toEqual(before);
  });
});
