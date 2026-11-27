import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getTableName, type Table } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import type { DB } from "@/db/client";
import { gcOrphanAttachments } from "./attachments";
import { newDek, seal } from "./crypto";

it("GC 同时保护成员附件和换图、还原所需的两份家庭附件密文", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "household-gc-"));
  vi.stubEnv("KZ_ATTACHMENT_DIR", dir);
  const references: Record<string, string[]> = { attachment: ["member"], household_attachment: ["cover-old", "cover-new"] };
  const db = { select: () => ({ from: (t: Table) => references[getTableName(t)].map((k) => ({ k })) }) };
  try {
    for (const name of ["member", "cover-old", "cover-new", "orphan"]) {
      await fs.writeFile(path.join(dir, name), seal(newDek(), "image", name));
    }
    expect(await gcOrphanAttachments(db as unknown as DB, undefined, Date.now() + 72 * 3600_000)).toEqual(["orphan"]);
    expect((await fs.readdir(dir)).sort()).toEqual(["cover-new", "cover-old", "member"]);
  } finally {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
