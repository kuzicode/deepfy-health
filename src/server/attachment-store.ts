import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { attachment, member } from "@/db/schema";
import { open, randomId, seal, sha256 } from "./crypto";
import { assertAttachmentPath, attachmentDir, gcOrphansThrottled } from "./attachments";
import { assertQuota, consumeUpload } from "./quota";
import { NotFound, attAad, type Tx } from "./repo-base";

// 一个账号的附件读写（密文文件 + attachment 表）。由 PgRepository 持有并委托，所有查询按 userId 限定（SEC）。

interface Ctx {
  db: DB;
  userId: string;
  dek: () => Promise<Buffer>;
  /** 账号写锁（与 PgRepository 的其他写入共用） */
  lock: (tx: Tx) => Promise<unknown>;
  members: () => Promise<{ id: string; slug: string }[]>;
}

export class AttachmentStore {
  constructor(private readonly ctx: Ctx) {}

  private async memberBySlug(slug: string) {
    const { db, userId } = this.ctx;
    const m = await db.query.member.findFirst({ where: and(eq(member.userId, userId), eq(member.slug, slug)) });
    if (!m) throw new NotFound();
    return m;
  }

  async put(slug: string, relPath: string, data: Buffer, mime: string) {
    assertAttachmentPath(relPath);
    const m = await this.memberBySlug(slug);
    const dek = await this.ctx.dek();
    const hash = sha256(data);
    // 额度检查与写入在账号写锁内：并发上传不能各自看到「还没满」再一起写进去；事务回滚时多出的密文文件由 GC 清理
    const unchanged = await this.ctx.db.transaction(async (tx) => {
      await this.ctx.lock(tx);
      const [prev] = await tx.select().from(attachment).where(and(eq(attachment.memberId, m.id), eq(attachment.relPath, relPath)));
      if (prev?.sha256 === hash) return true;
      await assertQuota(tx, this.ctx.userId, "attachmentBytes", data.length - (prev?.size ?? 0));
      if (!prev) await assertQuota(tx, this.ctx.userId, "attachmentCount");
      await consumeUpload(tx, this.ctx.userId, data.length);
      const storageKey = randomId();
      await fs.mkdir(/*turbopackIgnore: true*/ attachmentDir(), { recursive: true });
      await fs.writeFile(path.join(/*turbopackIgnore: true*/ attachmentDir(), storageKey), seal(dek, data, attAad(m.id, relPath)));
      const values = { mime, size: data.length, sha256: hash, storageKey };
      await tx.insert(attachment).values({ id: randomId(), memberId: m.id, relPath, ...values })
        .onConflictDoUpdate({ target: [attachment.memberId, attachment.relPath], set: values });
      return false;
    });
    if (unchanged) return { unchanged: true };
    // 旧文件不立即删除：备份先 pg_dump 再打包附件，快照里引用的旧文件必须在打包时仍然存在；由 GC 延迟清理
    gcOrphansThrottled(this.ctx.db);
    return { unchanged: false };
  }

  /** 撤销刚上传的附件记录（写入日志失败时回滚）；密文文件由 GC 延迟清理 */
  async remove(slug: string, relPath: string) {
    assertAttachmentPath(relPath);
    const m = await this.memberBySlug(slug);
    await this.ctx.db.delete(attachment).where(and(eq(attachment.memberId, m.id), eq(attachment.relPath, relPath)));
  }

  async get(slug: string, relPath: string) {
    assertAttachmentPath(relPath);
    const m = await this.memberBySlug(slug);
    const row = await this.ctx.db.query.attachment.findFirst({ where: and(eq(attachment.memberId, m.id), eq(attachment.relPath, relPath)) });
    if (!row) throw new NotFound();
    const sealed = await fs.readFile(path.join(/*turbopackIgnore: true*/ attachmentDir(), row.storageKey), "utf8");
    return { data: open(await this.ctx.dek(), sealed, attAad(m.id, relPath)), mime: row.mime };
  }

  async list() {
    const members = await this.ctx.members();
    if (!members.length) return [];
    const rows = await this.ctx.db.select().from(attachment).where(inArray(attachment.memberId, members.map((m) => m.id)));
    return rows.map((r) => ({ member: members.find((m) => m.id === r.memberId)!.slug, relPath: r.relPath, sha256: r.sha256, size: r.size, mime: r.mime }));
  }

  /** 删除账号前清理附件文件；数据库行随 user 级联删除 */
  async purgeFiles() {
    const members = await this.ctx.members();
    if (!members.length) return;
    const rows = await this.ctx.db.select({ storageKey: attachment.storageKey }).from(attachment).where(inArray(attachment.memberId, members.map((m) => m.id)));
    await Promise.all(rows.map((r) => fs.rm(path.join(/*turbopackIgnore: true*/ attachmentDir(), r.storageKey), { force: true })));
  }
}
