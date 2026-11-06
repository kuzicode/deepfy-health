import { eq } from "drizzle-orm";
import type { DocKind, RawDoc } from "@/core/bundle";
import type { DB } from "@/db/client";
import { userKey } from "@/db/schema";
import { newDek, unwrapDek, wrapDek } from "./crypto";

// PgRepository 及其拆出的模块（doc-write、attachment-store）共用的类型、错误与加密 AAD。
// 对外仍从 ./pg-repository 导入（那里重新导出），调用方不用关心拆分。

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export interface ImportResult { created: number; updated: number; unchanged: number; conflicts: string[] }

/** 网页 / agent 的单点修改（不经过整份 vault） */
export type Change =
  | { op: "add_member"; id: string; name: string; profile: Record<string, unknown> }
  | { op: "put"; member: string; kind: DocKind; key: string; data: Record<string, unknown>; body: string }
  /** 只新建：同 key 已存在（含并发请求刚写入）则抛 KeyTaken，不覆盖 */
  | { op: "create"; member: string; kind: DocKind; key: string; data: Record<string, unknown>; body: string }
  | { op: "delete"; member: string; kind: "log" | "record"; key: string };
/** agent 写入的来源（MCP token），记入 agent_change 以便展示与还原 */
export interface AuditInfo { tokenId: string; tokenName: string; tool: string }
export const CHANGE_RETENTION_DAYS = 90;

export class ImportRejected extends Error {
  constructor(readonly issues: { file: string; message: string }[]) {
    super(`数据校验未通过（${issues.length} 个错误），未写入任何内容`);
  }
}

/** 还原失败：已还原过，或文档在这次写入之后又被修改 */
export class RevertConflict extends Error {
  constructor() { super("revert conflict"); }
}

/** create 的 key 已被占用（调用方换一个 key 重试） */
export class KeyTaken extends Error {
  constructor() { super("key taken"); }
}

export class NotFound extends Error {
  constructor() { super("not found"); }
}

// 密文的附加认证数据：把密文绑定到它的位置，挪到别的成员 / 文档下就解不开
export const docAad = (memberId: string, kind: string, key: string) => `doc:${memberId}:${kind}:${key}`;
export const nameAad = (userId: string, slug: string) => `member:${userId}:${slug}`;
export const attAad = (memberId: string, relPath: string) => `att:${memberId}:${relPath}`;
export const docContent = (d: Pick<RawDoc, "data" | "body">) => JSON.stringify({ data: d.data, body: d.body });

export async function ensureUserKey(db: DB, userId: string, kek: Buffer): Promise<Buffer> {
  const row = await db.query.userKey.findFirst({ where: eq(userKey.userId, userId) });
  if (row) return unwrapDek(kek, row.wrappedDek, userId);
  const dek = newDek();
  await db.insert(userKey).values({ userId, wrappedDek: wrapDek(kek, dek, userId) }).onConflictDoNothing();
  // 并发首登时以先写入的为准
  const saved = await db.query.userKey.findFirst({ where: eq(userKey.userId, userId) });
  return unwrapDek(kek, saved!.wrappedDek, userId);
}
