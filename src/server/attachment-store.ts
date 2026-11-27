import { isSelfHosted } from "./edition";
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { attachment, householdAttachment, member } from "@/db/schema";
import { open, randomId, seal, sha256 } from "./crypto";
import { assertAttachmentPath, assertHouseholdAttachmentPath, attachmentDir, gcOrphansThrottled } from "./attachments";
import { QuotaExceeded, assertQuota, consumeUpload } from "./quota";
import { NotFound, attAad, hattAad, type Tx } from "./repo-base";

// 一个账号的附件读写（密文文件 + attachment 表）。由 PgRepository 持有并委托，所有查询按 userId 限定（SEC）。

interface Ctx {
  db: DB;
  userId: string;
  dek: () => Promise<Buffer>;
  /** 账号写锁（与 PgRepository 的其他写入共用） */
  lock: (tx: Tx) => Promise<unknown>;
  members: (tx?: Tx) => Promise<{ id: string; slug: string }[]>;
}

/** 数据库和备份在同一块盘上：剩余空间不够时停止接收附件，保住数据库 */
const GB = 1024 * 1024 * 1024;
/** 自托管常跑在小硬盘的家用设备上，留 1 GB */
const minFreeBytes = () => (isSelfHosted() ? GB : 5 * GB);
async function hasDiskRoom(bytes: number) {
  const { bavail, bsize } = await fs.statfs(/*turbopackIgnore: true*/ attachmentDir());
  return bavail * bsize >= minFreeBytes() + bytes;
}

/** 空间不足时先清理过期的旧文件再复查，否则上传一直失败，清理也一直等不到触发 */
async function assertDiskRoom(db: DB, bytes: number) {
  if (await hasDiskRoom(bytes)) return;
  await gcOrphansThrottled(db);
  if (!(await hasDiskRoom(bytes))) throw new QuotaExceeded("uploadBytesPerDay", 0);
}

export class AttachmentStore {
  constructor(private readonly ctx: Ctx) {}

  private async memberBySlug(slug: string) {
    const { db, userId } = this.ctx;
    const m = await db.query.member.findFirst({ where: and(eq(member.userId, userId), eq(member.slug, slug)) });
    if (!m) throw new NotFound();
    return m;
  }

  private async putFile(data: Buffer, mime: string, aad: string, target: {
    tx?: Tx;
    read: (tx: Tx, hash: string) => Promise<{ size: number; sha256: string } | undefined>;
    write: (tx: Tx, values: { mime: string; size: number; sha256: string; storageKey: string }) => Promise<unknown>;
  }) {
    const { db, userId } = this.ctx;
    const dek = await this.ctx.dek();
    const hash = sha256(data);
    const write = async (tx: Tx) => {
      const prev = await target.read(tx, hash);
      if (prev?.sha256 === hash) return true;
      await assertQuota(tx, userId, "attachmentBytes", data.length - (prev?.size ?? 0));
      if (!prev) await assertQuota(tx, userId, "attachmentCount");
      await consumeUpload(tx, userId, data.length);
      const storageKey = randomId();
      await fs.mkdir(/*turbopackIgnore: true*/ attachmentDir(), { recursive: true });
      await assertDiskRoom(db, data.length);
      await fs.writeFile(path.join(/*turbopackIgnore: true*/ attachmentDir(), storageKey), seal(dek, data, aad));
      await target.write(tx, { mime, size: data.length, sha256: hash, storageKey });
      return false;
    };
    const unchanged = target.tx ? await write(target.tx) : await db.transaction(async (tx) => {
      await this.ctx.lock(tx);
      return write(tx);
    });
    // 事务失败和替换留下的磁盘密文由 GC 延迟清理，给备份留出窗口。
    if (!unchanged) void gcOrphansThrottled(db);
    return { unchanged };
  }

  async put(slug: string, relPath: string, data: Buffer, mime: string) {
    assertAttachmentPath(relPath);
    const m = await this.memberBySlug(slug);
    return this.putFile(data, mime, attAad(m.id, relPath), {
      read: (tx) => tx.query.attachment.findFirst({ where: and(eq(attachment.memberId, m.id), eq(attachment.relPath, relPath)) }),
      write: (tx, values) => tx.insert(attachment).values({ id: randomId(), memberId: m.id, relPath, ...values })
        .onConflictDoUpdate({ target: [attachment.memberId, attachment.relPath], set: values }),
    });
  }

  async putHousehold(relPath: string, data: Buffer, mime: string, lockedTx?: Tx) {
    assertHouseholdAttachmentPath(relPath);
    const { userId } = this.ctx;
    const where = and(eq(householdAttachment.userId, userId), eq(householdAttachment.relPath, relPath));
    const suffix = /-([0-9a-f]{8})\.[^.]+$/.exec(relPath)?.[1];
    return this.putFile(data, mime, hattAad(userId, relPath), {
      tx: lockedTx,
      read: async (tx, hash) => {
        const prev = await tx.query.householdAttachment.findFirst({ where });
        if (prev && suffix === prev.sha256.slice(0, 8) && hash !== prev.sha256) {
          throw new Error("覆盖内容哈希封面的路径不合法，请使用新的文件名");
        }
        return prev;
      },
      write: (tx, values) => tx.insert(householdAttachment).values({ id: randomId(), userId, relPath, ...values })
        .onConflictDoUpdate({ target: [householdAttachment.userId, householdAttachment.relPath], set: values }),
    });
  }

  async removeHousehold(relPath: string) {
    assertHouseholdAttachmentPath(relPath);
    await this.ctx.db.transaction(async (tx) => {
      await this.ctx.lock(tx);
      const rows = await tx.delete(householdAttachment).where(and(eq(householdAttachment.userId, this.ctx.userId), eq(householdAttachment.relPath, relPath)))
        .returning({ id: householdAttachment.id });
      if (!rows.length) throw new NotFound();
    });
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
    return this.readFile(row, attAad(m.id, relPath));
  }

  async getHousehold(relPath: string) {
    assertHouseholdAttachmentPath(relPath);
    const { db, userId } = this.ctx;
    const row = await db.query.householdAttachment.findFirst({ where: and(eq(householdAttachment.userId, userId), eq(householdAttachment.relPath, relPath)) });
    return this.readFile(row, hattAad(userId, relPath));
  }

  private async readFile(row: { storageKey: string; mime: string } | undefined, aad: string) {
    if (!row) throw new NotFound();
    const sealed = await fs.readFile(path.join(/*turbopackIgnore: true*/ attachmentDir(), row.storageKey), "utf8");
    return { data: open(await this.ctx.dek(), sealed, aad), mime: row.mime };
  }

  listHousehold() {
    const { relPath, sha256, size, mime } = householdAttachment;
    return this.ctx.db.select({ relPath, sha256, size, mime }).from(householdAttachment).where(eq(householdAttachment.userId, this.ctx.userId));
  }

  async list() {
    const members = await this.ctx.members();
    if (!members.length) return [];
    const rows = await this.ctx.db.select().from(attachment).where(inArray(attachment.memberId, members.map((m) => m.id)));
    return rows.map((r) => ({ member: members.find((m) => m.id === r.memberId)!.slug, relPath: r.relPath, sha256: r.sha256, size: r.size, mime: r.mime }));
  }

  /** 删除账号前清理附件文件；数据库行随 user 级联删除 */
  async purgeFiles() {
    const { db, userId } = this.ctx;
    await db.transaction(async (tx) => {
      await this.ctx.lock(tx);
      const ids = (await this.ctx.members(tx)).map((m) => m.id);
      const rows = ids.length ? await tx.select({ storageKey: attachment.storageKey }).from(attachment).where(inArray(attachment.memberId, ids)) : [];
      const covers = await tx.select({ storageKey: householdAttachment.storageKey }).from(householdAttachment).where(eq(householdAttachment.userId, userId));
      await Promise.all([...rows, ...covers].map((r) => fs.rm(path.join(/*turbopackIgnore: true*/ attachmentDir(), r.storageKey), { force: true })));
    });
  }
}
