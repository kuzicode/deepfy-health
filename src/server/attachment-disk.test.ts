import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, type DB } from "@/db/client";
import { user } from "@/db/schema";
import { newDek, randomId } from "./crypto";
import { PgRepository } from "./pg-repository";

const URL = process.env.KZ_TEST_DATABASE_URL;

describe.skipIf(!URL)("磁盘不足时的附件上传（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  let repo: PgRepository;
  let dir: string;
  const uid = `disk-${randomId()}`;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "kzh-disk-"));
    process.env.KZ_ATTACHMENT_DIR = dir;
    db = createDb(URL!);
    await db.insert(user).values({ id: uid, name: uid, email: `${uid}@example.com` });
    repo = new PgRepository(db, uid, newDek());
    await repo.applyChanges([{ op: "add_member", id: "m", name: "m", profile: { id: "m", name: "m", sex: "female", birth_date: "1970-01-15" } }]);
  });
  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, uid));
    await db.$client.end();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("空间不足时先清理过期旧文件，腾出空间后上传成功，新文件和未过期的文件不动", async () => {
    const old = path.join(dir, "orphan-old");
    const fresh = path.join(dir, "orphan-fresh");
    await fs.writeFile(old, "x");
    await fs.writeFile(fresh, "x");
    const longAgo = new Date(Date.now() - 72 * 3600_000);
    await fs.utimes(old, longAgo, longAgo);
    const real = fs.statfs;
    // 旧文件还在时报告空间不足，清理之后恢复
    vi.spyOn(fs, "statfs").mockImplementation((async (p: string) => {
      const stat = await real(p);
      const present = await fs.stat(old).then(() => true, () => false);
      return { ...stat, bavail: present ? 0 : stat.bavail, bsize: present ? 1 : Math.max(stat.bsize, 4096 * 1024) };
    }) as never);
    await expect(repo.putAttachment("m", "attachments/a.pdf", Buffer.from("data"), "application/pdf")).resolves.toMatchObject({ unchanged: false });
    await expect(fs.stat(old)).rejects.toThrow();
    await expect(fs.stat(fresh)).resolves.toBeTruthy();
  });

  it("清理后仍然不足就拒绝，不写入", async () => {
    const real = fs.statfs;
    vi.spyOn(fs, "statfs").mockImplementation((async (p: string) => ({ ...(await real(p)), bavail: 0 })) as never);
    await expect(repo.putAttachment("m", "attachments/b.pdf", Buffer.from("data"), "application/pdf")).rejects.toMatchObject({ resource: "uploadBytesPerDay" });
    expect((await repo.listAttachments()).map((a) => a.relPath)).not.toContain("attachments/b.pdf");
  });
});
