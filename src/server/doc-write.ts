import { and, eq, lt } from "drizzle-orm";
import { DOC_KINDS, docPath, isSafeDocKey, type RawVault } from "@/core/bundle";
import { FamilyMemberSchema } from "@/core/schema";
import { agentChange, doc } from "@/db/schema";
import { randomId, seal, sha256 } from "./crypto";
import { CHANGE_RETENTION_DAYS, ImportRejected, KeyTaken, NotFound, docAad, docContent, type AuditInfo, type Change, type Tx } from "./repo-base";

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
  const id = randomId();
  await tx.insert(agentChange).values({
    id, userId: audit.userId, memberId, tokenId: audit.tokenId, tokenName: audit.tokenName, tool: audit.tool, kind: c.kind, key: c.key,
    prevCiphertext: prev?.ciphertext ?? null, prevSha256: prev?.sha ?? null, newSha256: row.contentSha256,
    createdAt: new Date(), // 锁内时间：保证「新到旧」与实际写入顺序一致（默认 now() 是事务开始时间）
  });
  await tx.delete(agentChange).where(and(eq(agentChange.userId, audit.userId), lt(agentChange.createdAt, new Date(Date.now() - CHANGE_RETENTION_DAYS * 86400_000))));
  return id;
}

/** applyChanges 的内存合并：改 raw，记下被改的文件（只用这些文件的校验错误）和要删的附件 */
export function mergeChange(raw: RawVault, c: Change, touched: Set<string>, removed: { member: string; relPath: string }[]) {
  if (c.op === "add_member") {
    if (raw.family.members.some((m) => m.id === c.id)) throw new ImportRejected([{ file: c.id, message: "成员已存在" }]);
    const fm = FamilyMemberSchema.parse({ id: c.id, name: c.name, role: raw.family.members.length ? "member" : "admin", dir: c.id });
    raw.family.members.push(fm);
    raw.docs[c.id] = [{ kind: "profile", key: "", data: c.profile, body: "" }];
    touched.add(docPath(fm, { kind: "profile", key: "" }));
    return;
  }
  const fm = raw.family.members.find((m) => m.id === c.member);
  if (!fm) throw new NotFound();
  if (!DOC_KINDS.includes(c.kind) || !isSafeDocKey(c.kind, c.key)) throw new ImportRejected([{ file: c.key, message: `非法的${c.kind}文档名` }]);
  const docs = (raw.docs[c.member] ??= []);
  const i = docs.findIndex((d) => d.kind === c.kind && d.key === c.key);
  if (c.op === "put" || c.op === "create") {
    if (c.op === "create" && i >= 0) throw new KeyTaken();
    const next = { kind: c.kind, key: c.key, data: c.data, body: c.body };
    if (i >= 0) docs[i] = next; else docs.push(next);
    touched.add(docPath(fm, c));
    return;
  }
  if (i < 0) throw new NotFound();
  if (c.kind === "record" && docs[i].data.type !== "manual") throw new ImportRejected([{ file: c.key, message: "只能删除手动记录" }]);
  for (const a of (docs[i].data.attachments as string[] | undefined) ?? []) removed.push({ member: c.member, relPath: a });
  docs.splice(i, 1);
}
