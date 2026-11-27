import { and, eq, lt } from "drizzle-orm";
import { DOC_KINDS, HOUSEHOLD_DOC_KINDS, MAX_DOC_BODY_LENGTH, MAX_DOC_DATA_LENGTH, docPath, householdDocPath, isSafeDocKey, isSafeHouseholdDocKey, type RawHouseholdDoc, type RawVault } from "@/core/bundle";
import { FamilyMemberSchema } from "@/core/schema";
import { agentChange, doc, householdDoc } from "@/db/schema";
import { randomId, seal, sha256 } from "./crypto";
import { CHANGE_RETENTION_DAYS, ImportRejected, KeyTaken, NotFound, docAad, docContent, hdocAad, isHouseholdChange, type HouseholdChange, type AuditInfo, type Change, type Tx } from "./repo-base";

/** 写入一个文档（put 覆盖 / create 只新建）；有 audit 时先保存旧密文，记一条 agent_change 并返回其 id */
export async function writeDoc(tx: Tx, { dek, memberId, c, audit }: { dek: Buffer; memberId: string; c: Extract<Change, { op: "put" | "create" }>; audit?: AuditInfo & { userId: string } }) {
  const where = and(eq(doc.memberId, memberId), eq(doc.kind, c.kind), eq(doc.key, c.key));
  const [prev] = audit ? await tx.select({ ciphertext: doc.ciphertext, sha: doc.contentSha256 }).from(doc).where(where).for("update") : [];
  const content = docContent(c);
  const row = { contentSha256: sha256(content), ciphertext: seal(dek, content, docAad(memberId, c.kind, c.key)), updatedAt: new Date() };
  const insert = tx.insert(doc).values({ id: randomId(), memberId, kind: c.kind, key: c.key, ...row });
  const target = [doc.memberId, doc.kind, doc.key];
  // create 只插入：唯一约束保证并发时只有一个请求拿到这个 key
  const written = c.op === "create"
    ? await insert.onConflictDoNothing({ target }).returning({ id: doc.id })
    : await insert.onConflictDoUpdate({ target, set: row }).returning({ id: doc.id });
  if (!written.length) throw new KeyTaken();
  if (!audit) return undefined;
  return recordChange(tx, { audit, memberId, prev, kind: c.kind, key: c.key, newSha256: row.contentSha256 });
}

type Previous = { ciphertext: string; sha: string };
type AccountAudit = AuditInfo & { userId: string };

async function recordChange(tx: Tx, change: {
  audit: AccountAudit; memberId: string | null; prev?: Previous; kind: string; key: string; newSha256: string;
}) {
  const { audit, memberId, prev, kind, key, newSha256 } = change;
  const id = randomId();
  await tx.insert(agentChange).values({
    ...audit, id, memberId, scope: memberId === null ? "household" : "member", kind, key, newSha256,
    prevCiphertext: prev?.ciphertext ?? null, prevSha256: prev?.sha ?? null, createdAt: new Date(),
  });
  await tx.delete(agentChange).where(and(eq(agentChange.userId, audit.userId), lt(agentChange.createdAt, new Date(Date.now() - CHANGE_RETENTION_DAYS * 86400_000))));
  return id;
}

export function householdWhere(userId: string, c: { kind: string; key: string }) {
  return and(eq(householdDoc.userId, userId), eq(householdDoc.kind, c.kind), eq(householdDoc.key, c.key));
}

/** 删除的当前版本用空串表示，与任一 SHA-256 摘要都不同。 */
export const DELETED_SHA = "";

export async function writeHouseholdDoc(tx: Tx, { dek, userId, c, audit }: {
  dek: Buffer; userId: string; c: HouseholdChange; audit?: AuditInfo;
}) {
  const where = householdWhere(userId, c);
  const [prev] = audit ? await tx.select({ ciphertext: householdDoc.ciphertext, sha: householdDoc.contentSha256 }).from(householdDoc).where(where) : [];
  let newSha256 = DELETED_SHA;
  if (c.op === "delete_household") {
    await tx.delete(householdDoc).where(where);
  } else {
    const content = docContent(c);
    newSha256 = sha256(content);
    const row = { ciphertext: seal(dek, content, hdocAad(userId, c.kind, c.key)), contentSha256: newSha256, updatedAt: new Date() };
    const insert = tx.insert(householdDoc).values({ id: randomId(), userId, kind: c.kind, key: c.key, ...row });
    const target = [householdDoc.userId, householdDoc.kind, householdDoc.key];
    if (c.op === "create_household") {
      if (!(await insert.onConflictDoNothing({ target }).returning({ id: householdDoc.id })).length) throw new KeyTaken();
    } else await insert.onConflictDoUpdate({ target, set: row });
  }
  if (audit) return recordChange(tx, { audit: { ...audit, userId }, memberId: null, prev, kind: c.kind, key: c.key, newSha256 });
}

export function assertHouseholdDocSize(d: RawHouseholdDoc) {
  if (d.body.length > MAX_DOC_BODY_LENGTH || JSON.stringify(d.data).length > MAX_DOC_DATA_LENGTH) {
    throw new ImportRejected([{ file: householdDocPath(d), message: "文档内容太大" }]);
  }
}

function mergeHousehold(raw: RawVault, c: HouseholdChange, touched: Set<string>) {
  if (!HOUSEHOLD_DOC_KINDS.includes(c.kind) || !isSafeHouseholdDocKey(c.kind, c.key)) {
    throw new ImportRejected([{ file: c.key, message: "非法的家庭文档名" }]);
  }
  const docs = raw.householdDocs ??= [];
  const i = docs.findIndex((d) => d.kind === c.kind && d.key === c.key);
  touched.add(householdDocPath(c));
  if (c.op === "delete_household") {
    if (i < 0) throw new NotFound();
    docs.splice(i, 1);
    return;
  }
  assertHouseholdDocSize(c);
  if (c.op === "create_household" && i >= 0) throw new KeyTaken();
  const next = { kind: c.kind, key: c.key, data: c.data, body: c.body };
  if (i < 0) docs.push(next); else docs[i] = next;
}

/** applyChanges 的内存合并：改 raw，记下被改的文件（只用这些文件的校验错误）和要删的附件 */
export function mergeChange(raw: RawVault, c: Change, touched: Set<string>, removed: { member: string; relPath: string }[]) {
  if (isHouseholdChange(c)) return mergeHousehold(raw, c, touched);
  if (c.op === "add_member") {
    if (raw.family.members.some((m) => m.id === c.id)) throw new ImportRejected([{ file: c.id, message: "成员已存在" }]);
    const fm = FamilyMemberSchema.parse({ id: c.id, name: c.name, role: raw.family.members.length ? "member" : "admin", dir: c.id });
    raw.family.members.push(fm);
    raw.docs[c.id] = [{ kind: "profile", key: "", data: c.profile, body: "" }];
    touched.add(docPath(fm, { kind: "profile", key: "" }));
    return;
  }
  return mergeMemberDoc(raw, c, touched, removed);
}

function mergeMemberDoc(raw: RawVault, c: Extract<Change, { member: string }>, touched: Set<string>, removed: { member: string; relPath: string }[]) {
  const fm = raw.family.members.find((m) => m.id === c.member);
  if (!fm) throw new NotFound();
  if (!DOC_KINDS.includes(c.kind) || !isSafeDocKey(c.kind, c.key)) throw new ImportRejected([{ file: c.key, message: `非法的${c.kind}文档名` }]);
  const docs = (raw.docs[c.member] ??= []);
  const i = docs.findIndex((d) => d.kind === c.kind && d.key === c.key);
  if (c.op !== "delete") {
    if (c.op === "create" && i >= 0) throw new KeyTaken();
    const next = { kind: c.kind, key: c.key, data: c.data, body: c.body };
    if (i >= 0) docs[i] = next; else docs.push(next);
    touched.add(docPath(fm, c));
    return;
  }
  removeMemberDoc(docs, i, c, removed);
}

function removeMemberDoc(docs: RawVault["docs"][string], i: number, c: Extract<Change, { op: "delete" }>, removed: { member: string; relPath: string }[]) {
  if (i < 0) throw new NotFound();
  if (c.kind === "record" && docs[i].data.type !== "manual") throw new ImportRejected([{ file: c.key, message: "只能删除手动记录" }]);
  for (const a of (docs[i].data.attachments as string[] | undefined) ?? []) removed.push({ member: c.member, relPath: a });
  docs.splice(i, 1);
}
