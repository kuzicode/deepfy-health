import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DB } from "@/db/client";
import { agentChange, doc, householdDoc, member } from "@/db/schema";
import { assertDocQuota } from "./quota";
import { randomId } from "./crypto";
import { DELETED_SHA, householdWhere } from "./doc-write";
import { NotFound, RevertConflict, type Tx } from "./repo-base";

// 同一路径可以删除、重建、再删除。缺少当前行时，只有最近一次尚未撤销的删除能代表当前版本。
function latestDeletion(db: DB | Tx, userId: string, kind: string | typeof agentChange.kind, key: string | typeof agentChange.key) {
  const d = alias(agentChange, "deletions");
  return db.select({ id: d.id }).from(d).where(and(
    eq(d.userId, userId), eq(d.scope, "household"), eq(d.kind, kind), eq(d.key, key), eq(d.newSha256, DELETED_SHA), isNull(d.revertedAt),
  )).orderBy(desc(d.createdAt), desc(d.id)).limit(1);
}

export async function listAgentChanges(db: DB, userId: string, limit: number) {
  const { id, tokenName, tool, kind, key, createdAt, revertedAt, scope, newSha256 } = agentChange;
  const rows = await db.select({
    id, tokenName, tool, kind, key, createdAt, revertedAt, scope, newSha256, member: member.slug,
    memberSha: doc.contentSha256, householdSha: householdDoc.contentSha256,
    deletionId: sql<string | null>`case when ${newSha256} = ${DELETED_SHA} then (${latestDeletion(db, userId, kind, key)}) end`,
  }).from(agentChange)
    .leftJoin(member, and(eq(member.id, agentChange.memberId), eq(member.userId, userId), eq(scope, "member")))
    .leftJoin(doc, and(eq(doc.memberId, member.id), eq(doc.kind, kind), eq(doc.key, key)))
    .leftJoin(householdDoc, and(eq(scope, "household"), eq(householdDoc.userId, userId), eq(householdDoc.kind, kind), eq(householdDoc.key, key)))
    .where(eq(agentChange.userId, userId)).orderBy(desc(createdAt)).limit(limit);
  return rows.map(({ memberSha, householdSha, newSha256, deletionId, ...row }) => {
    const sha = row.scope === "household" ? householdSha : memberSha;
    const matches = newSha256 === DELETED_SHA ? sha === null && deletionId === row.id : sha === newSha256;
    return { ...row, revertible: !row.revertedAt && matches };
  });
}

async function revertHousehold(tx: Tx, ch: typeof agentChange.$inferSelect) {
  const where = householdWhere(ch.userId, ch);
  const [cur] = await tx.select({ sha: householdDoc.contentSha256 }).from(householdDoc).where(where).for("update");
  if ((cur?.sha ?? DELETED_SHA) !== ch.newSha256) throw new RevertConflict();
  if (!cur) {
    const [latest] = await latestDeletion(tx, ch.userId, ch.kind, ch.key);
    if (latest?.id !== ch.id) throw new RevertConflict();
  }
  if (!ch.prevCiphertext || !ch.prevSha256) {
    await tx.delete(householdDoc).where(where);
    return;
  }
  const row = { ciphertext: ch.prevCiphertext, contentSha256: ch.prevSha256, updatedAt: new Date() };
  if (cur) await tx.update(householdDoc).set(row).where(where);
  else await tx.insert(householdDoc).values({ ...row, id: randomId(), userId: ch.userId, kind: ch.kind, key: ch.key });
  await assertDocQuota(tx, ch.userId);
}

async function revertMember(tx: Tx, ch: typeof agentChange.$inferSelect) {
  if (!ch.memberId) throw new NotFound();
  const owned = tx.select({ id: member.id }).from(member).where(eq(member.userId, ch.userId));
  const where = and(inArray(doc.memberId, owned), eq(doc.memberId, ch.memberId), eq(doc.kind, ch.kind), eq(doc.key, ch.key));
  const [cur] = await tx.select({ sha: doc.contentSha256 }).from(doc).where(where).for("update");
  if (cur?.sha !== ch.newSha256) throw new RevertConflict();
  if (ch.prevCiphertext && ch.prevSha256) await tx.update(doc).set({ ciphertext: ch.prevCiphertext, contentSha256: ch.prevSha256, updatedAt: new Date() }).where(where);
  else await tx.delete(doc).where(where);
}

/** 调用方持有账号事务锁。历史密文仍绑定原位置，直接恢复即可。 */
export async function revertChange(tx: Tx, userId: string, id: string) {
  const where = and(eq(agentChange.id, id), eq(agentChange.userId, userId));
  const [ch] = await tx.select().from(agentChange).where(where).for("update");
  if (!ch) throw new NotFound();
  if (ch.revertedAt) throw new RevertConflict();
  if (ch.scope === "household") await revertHousehold(tx, ch);
  else await revertMember(tx, ch);
  await tx.update(agentChange).set({ revertedAt: new Date() }).where(where);
}
