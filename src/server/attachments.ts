import fs from "node:fs/promises";
import path from "node:path";
import type { DB } from "@/db/client";
import { attachment } from "@/db/schema";

// 附件密文文件：存放目录、路径校验、孤儿文件延迟清理（数据库行由 PgRepository 维护）

export const attachmentDir = () => process.env.KZ_ATTACHMENT_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data/attachments");

export function assertAttachmentPath(relPath: string) {
  const norm = path.posix.normalize(relPath);
  if (!norm.startsWith("attachments/") || norm.includes("..") || norm !== relPath) throw new Error(`附件路径不合法：${relPath}`);
}

const ORPHAN_MIN_AGE_MS = 48 * 3600_000;
const GC_INTERVAL_MS = 10 * 60_000;
let lastGc = 0;

/** 上传后顺带清理：要遍历整个目录，全站最多 10 分钟跑一次 */
export function gcOrphansThrottled(db: DB, now = Date.now()) {
  if (now - lastGc < GC_INTERVAL_MS) return;
  lastGc = now;
  void gcOrphanAttachments(db).catch(() => {});
}

/** 清理没有任何记录引用、且已超过 minAge 的附件密文文件 */
export async function gcOrphanAttachments(db: DB, minAgeMs = ORPHAN_MIN_AGE_MS, now = Date.now()) {
  const dir = attachmentDir();
  const files = await fs.readdir(/*turbopackIgnore: true*/ dir).catch(() => [] as string[]);
  if (!files.length) return [];
  const referenced = new Set((await db.select({ k: attachment.storageKey }).from(attachment)).map((r) => r.k));
  const removed: string[] = [];
  for (const f of files) {
    if (referenced.has(f)) continue;
    const full = path.join(/*turbopackIgnore: true*/ dir, f);
    const st = await fs.stat(full).catch(() => undefined);
    if (st?.isFile() && now - st.mtimeMs > minAgeMs) {
      await fs.rm(full, { force: true });
      removed.push(f);
    }
  }
  return removed;
}
