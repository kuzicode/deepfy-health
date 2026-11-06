import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { apiToken } from "@/db/schema";
import { isDisabled } from "./access";
import { open, randomId, seal, sha256 } from "./crypto";
import { assertQuota, lockUser } from "./quota";

// API token：给 kzh 和 MCP 用。校验只用 sha256；明文另用账号 DEK 加密保存（与健康数据同级保护），
// 让用户之后还能再次复制配置——能读到它的人本来就能读到全部档案，不额外扩大暴露面

const tokenAad = (userId: string, id: string) => `token:${userId}:${id}`;

/** dek 省略时只存哈希（测试与旧调用）；网页创建时总是传入，以便之后再次复制 */
/** read：只读。write：经 MCP 写入，每次都留修改记录、可还原。sync：kzh push 整批覆盖，不留修改记录，MCP 上只读 */
export type TokenScope = "read" | "write" | "sync";
export const asScope = (v: unknown): TokenScope => (v === "write" || v === "sync" ? v : "read");

export async function createToken(db: DB, userId: string, name: string, opts: { dek?: Buffer; scope?: TokenScope } = {}) {
  const { dek, scope = "read" } = opts;
  const token = newSecret();
  const id = randomId();
  // 额度检查与插入在账号写锁内，并发创建不会超出上限
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await assertQuota(tx, userId, "tokens");
    await tx.insert(apiToken).values({
      id, userId, name: name.trim().slice(0, 60) || "未命名", tokenHash: sha256(token),
      tokenCipher: dek ? seal(dek, token, tokenAad(userId, id)) : null, scope,
    });
  });
  return token;
}

/** 取回明文（仅限本人）；旧 token 没有密文时返回 undefined，需要重新生成 */
export async function revealToken(db: DB, userId: string, id: string, dek: Buffer) {
  const [row] = await db.select({ c: apiToken.tokenCipher }).from(apiToken).where(and(eq(apiToken.userId, userId), eq(apiToken.id, id)));
  return row?.c ? open(dek, row.c, tokenAad(userId, id)).toString("utf8") : undefined;
}

const newSecret = () => `kzh_${crypto.randomBytes(32).toString("base64url")}`;

/** 重新生成：同一条接入换新密钥，旧密钥立即失效（明文只存在于这次返回值里） */
export async function rotateToken(db: DB, userId: string, id: string, dek?: Buffer) {
  const token = newSecret();
  const [row] = await db.update(apiToken).set({ tokenHash: sha256(token), tokenCipher: dek ? seal(dek, token, tokenAad(userId, id)) : null, lastUsedAt: null })
    .where(and(eq(apiToken.userId, userId), eq(apiToken.id, id))).returning({ id: apiToken.id });
  return row ? token : undefined;
}

export const listTokens = (db: DB, userId: string) =>
  db.select({ id: apiToken.id, name: apiToken.name, createdAt: apiToken.createdAt, lastUsedAt: apiToken.lastUsedAt, scope: apiToken.scope, revealable: sql<boolean>`${apiToken.tokenCipher} is not null` })
    .from(apiToken).where(eq(apiToken.userId, userId)).orderBy(desc(apiToken.createdAt));

export const revokeToken = (db: DB, userId: string, id: string) =>
  db.delete(apiToken).where(and(eq(apiToken.userId, userId), eq(apiToken.id, id)));

export const setTokenScope = (db: DB, userId: string, id: string, scope: TokenScope) =>
  db.update(apiToken).set({ scope }).where(and(eq(apiToken.userId, userId), eq(apiToken.id, id)));

export interface TokenAuth { userId: string; tokenId: string; name: string; scope: TokenScope }

/** Bearer 鉴权：返回 token 所属用户、名称与权限；停用账号一律拒绝 */
export async function tokenAuth(db: DB, header: string | null): Promise<TokenAuth | undefined> {
  const token = header?.match(/^Bearer\s+(kzh_[A-Za-z0-9_-]{20,})$/)?.[1];
  if (!token) return undefined;
  const [row] = await db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.tokenHash, sha256(token)))
    .returning({ userId: apiToken.userId, tokenId: apiToken.id, name: apiToken.name, scope: apiToken.scope });
  if (!row || (await isDisabled(db, row.userId))) return undefined;
  return { ...row, scope: asScope(row.scope) };
}

export const userIdForToken = async (db: DB, header: string | null) => (await tokenAuth(db, header))?.userId;
