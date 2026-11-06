import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { DOC_KINDS, buildSnapshot, type DocKind, type HealthReader, type RawDoc, type RawVault, type VaultSnapshot } from "@/core/bundle";
import { FamilyMemberSchema } from "@/core/schema";
import type { DB } from "@/db/client";
import { agentChange, attachment, doc, household, member } from "@/db/schema";
import { open, randomId, seal, sha256 } from "./crypto";
import { AttachmentStore } from "./attachment-store";
import { mergeChange, writeDoc } from "./doc-write";
import { logKey as logKeyFor } from "./quick-entry";
import { QuotaExceeded, assertDocQuota, assertQuota, limitsOf, lockUser } from "./quota";
import { ImportRejected, NotFound, RevertConflict, docAad, docContent, ensureUserKey, nameAad, type AuditInfo, type Change, type ImportResult, type Tx } from "./repo-base";

// 对外入口：类型与错误定义在 repo-base，写文档在 doc-write，附件在 attachment-store；调用方只从这里导入
export { ImportRejected, KeyTaken, NotFound, RevertConflict, ensureUserKey, type AuditInfo, type Change, type ImportResult } from "./repo-base";

/** 当前登录用户的云端数据；所有查询都按 userId 限定（SEC） */
export class PgRepository implements HealthReader {
  private dekPromise?: Promise<Buffer>;
  private readonly files: AttachmentStore;
  constructor(private readonly db: DB, readonly userId: string, private readonly kek: Buffer) {
    this.files = new AttachmentStore({ db, userId, dek: () => this.dek(), lock: (tx) => this.lock(tx), members: () => this.members() });
  }

  private dek() {
    this.dekPromise ??= ensureUserKey(this.db, this.userId, this.kek);
    return this.dekPromise;
  }

  private async members(q: DB | Tx = this.db) {
    // 稳定顺序：按添加先后（同一次导入里时间相同，再按 slug），否则 Postgres 返回顺序不确定，家人列表会跳动
    return q.select().from(member).where(eq(member.userId, this.userId)).orderBy(asc(member.createdAt), asc(member.slug));
  }

  /** 同一账号的所有写入串行化（事务级 advisory lock，提交或回滚时自动释放）：读取—合并—写入在锁内完成，避免并发覆盖 */
  private lock(tx: Tx) {
    return lockUser(tx, this.userId);
  }

  /** q 传事务时在锁内读取（applyChanges 用） */
  async exportRaw(q: DB | Tx = this.db): Promise<RawVault> {
    const dek = await this.dek();
    const [hh, members] = await Promise.all([
      q.query.household.findFirst({ where: eq(household.userId, this.userId) }),
      this.members(q),
    ]);
    const docs = members.length ? await q.select().from(doc).where(inArray(doc.memberId, members.map((m) => m.id))) : [];
    const family = {
      family: hh?.name ?? undefined,
      members: members.map((m) => FamilyMemberSchema.parse({
        id: m.slug, name: open(dek, m.nameCipher, nameAad(this.userId, m.slug)).toString(), role: m.role, dir: m.dir ?? undefined,
      })),
    };
    const out: Record<string, RawDoc[]> = Object.fromEntries(members.map((m) => [m.slug, []]));
    for (const d of docs) {
      const m = members.find((x) => x.id === d.memberId)!;
      const { data, body } = JSON.parse(open(dek, d.ciphertext, docAad(m.id, d.kind, d.key)).toString());
      out[m.slug].push({ kind: d.kind as DocKind, key: d.key, data, body, updatedAt: d.updatedAt.toISOString() });
    }
    return { family, customCatalog: (hh?.customCatalog ?? []) as RawVault["customCatalog"], docs: out };
  }

  async snapshot(): Promise<VaultSnapshot> {
    const raw = await this.exportRaw();
    const members = await this.members();
    const atts = members.length ? await this.db.select({ memberId: attachment.memberId, relPath: attachment.relPath }).from(attachment).where(inArray(attachment.memberId, members.map((m) => m.id))) : [];
    const have = new Set(atts.map((a) => `${members.find((m) => m.id === a.memberId)!.slug}/${a.relPath}`));
    return buildSnapshot(raw, { root: "cloud", attachmentExists: (id, rel) => have.has(`${id}/${rel}`) });
  }

  async getMember(id: string) {
    const s = await this.snapshot();
    const m = s.members.find((x) => x.id === id);
    return m && { member: m, catalog: s.catalog };
  }

  /** 整批校验通过才写入；云端版本比本地新时不覆盖（除非 force） */
  async importRaw(raw: RawVault, opts: { force?: boolean } = {}): Promise<ImportResult> {
    const maxDocs = (await limitsOf(this.db, this.userId)).docs;
    if (Object.values(raw.docs).flat().length > maxDocs) throw new QuotaExceeded("docs", maxDocs);
    validateImport(raw);
    const dek = await this.dek();
    const result: ImportResult = { created: 0, updated: 0, unchanged: 0, conflicts: [] };

    await this.db.transaction(async (tx) => {
      await this.lock(tx);
      const known = new Set((await this.members(tx)).map((m) => m.slug));
      const added = raw.family.members.filter((m) => !known.has(m.id)).length;
      if (added) await assertQuota(tx, this.userId, "members", added);
      const hh = { name: raw.family.family ?? null, customCatalog: raw.customCatalog };
      await tx.insert(household).values({ userId: this.userId, ...hh }).onConflictDoUpdate({ target: household.userId, set: { ...hh, updatedAt: new Date() } });

      for (const fm of raw.family.members) {
        const values = { nameCipher: seal(dek, fm.name, nameAad(this.userId, fm.id)), role: fm.role, dir: fm.dir ?? null };
        const [m] = await tx.insert(member).values({ id: randomId(), userId: this.userId, slug: fm.id, ...values })
          .onConflictDoUpdate({ target: [member.userId, member.slug], set: values }).returning();
        const existing = await tx.select().from(doc).where(eq(doc.memberId, m.id));
        for (const d of raw.docs[fm.id] ?? []) {
          const prev = existing.find((e) => e.kind === d.kind && e.key === d.key);
          const outcome = await importDoc(tx, { dek, memberId: m.id, d, prev, force: !!opts.force });
          if (outcome === "conflict") result.conflicts.push(`${fm.id}/${d.kind}${d.key ? `/${d.key}` : ""}`);
          else result[outcome]++;
        }
      }
      await assertDocQuota(tx, this.userId);
    });
    return result;
  }

  /**
   * 单点修改：在当前数据上合并改动，用 buildSnapshot 校验（只看被改文件的错误，已有数据的旧问题不阻塞网页编辑），
   * 通过后只写改动的文档；不碰 household 与自定义指标。删除日志时一并删掉它的附件记录（密文文件由 GC 延迟清理）。
   * changes 可以是函数：在锁内拿到最新数据再算出改动（读—改—写不会被并发请求覆盖）。
   * 返回 agent 修改记录的 id（只有传入 audit 的 put / create 才记录）。
   */
  async applyChanges(input: Change[] | ((raw: RawVault) => Change[] | Promise<Change[]>), opts: { audit?: AuditInfo } = {}): Promise<string[]> {
    const dek = await this.dek();
    return this.db.transaction(async (tx) => {
      await this.lock(tx);
      const raw = await this.exportRaw(tx);
      const changes = typeof input === "function" ? await input(structuredClone(raw)) : input;
      // 额度在锁内按实际改动数检查：家人数；agent 写入按会产生修改记录的 put / create 条数（一次改多项就扣多条）
      const newMembers = changes.filter((c) => c.op === "add_member").length;
      if (newMembers) await assertQuota(tx, this.userId, "members", newMembers);
      const audited = opts.audit ? changes.filter((c) => c.op === "put" || c.op === "create").length : 0;
      if (audited) await assertQuota(tx, this.userId, "mcpWritesPerDay", audited);
      const touched = new Set<string>();
      const removedAttachments: { member: string; relPath: string }[] = [];
      for (const c of changes) mergeChange(raw, c, touched, removedAttachments);
      // 只删除改动后已无任何文档引用的附件（导入的数据里多份记录可能共用同一个文件）
      const stillUsed = (m: string, rel: string) => (raw.docs[m] ?? []).some((d) => ((d.data.attachments as string[] | undefined) ?? []).includes(rel));
      const orphaned = removedAttachments.filter((a) => !stillUsed(a.member, a.relPath));
      const errors = buildSnapshot(raw, { root: "web" }).issues.filter((x) => x.level === "error" && touched.has(x.file));
      if (errors.length) throw new ImportRejected(errors);
      const ids = await this.writeChanges(tx, { dek, raw, changes, orphaned, audit: opts.audit });
      await assertDocQuota(tx, this.userId);
      return ids;
    });
  }

  private async writeChanges(tx: Tx, { dek, raw, changes, orphaned, audit }: { dek: Buffer; raw: RawVault; changes: Change[]; orphaned: { member: string; relPath: string }[]; audit?: AuditInfo }) {
    const changeIds: string[] = [];
    const memberId = async (slug: string) =>
      (await tx.select({ id: member.id }).from(member).where(and(eq(member.userId, this.userId), eq(member.slug, slug))))[0].id;
    for (const c of changes) {
      if (c.op === "add_member") {
        await tx.insert(household).values({ userId: this.userId }).onConflictDoNothing();
        const fm = raw.family.members.find((m) => m.id === c.id)!;
        const [m] = await tx.insert(member).values({ id: randomId(), userId: this.userId, slug: fm.id, role: fm.role, dir: fm.dir ?? null, nameCipher: seal(dek, fm.name, nameAad(this.userId, fm.id)) }).returning();
        const content = docContent(raw.docs[c.id][0]);
        await tx.insert(doc).values({ id: randomId(), memberId: m.id, kind: "profile", key: "", contentSha256: sha256(content), ciphertext: seal(dek, content, docAad(m.id, "profile", "")) });
      } else if (c.op === "delete") {
        await tx.delete(doc).where(and(eq(doc.memberId, await memberId(c.member)), eq(doc.kind, c.kind), eq(doc.key, c.key)));
      } else {
        const id = await writeDoc(tx, { dek, memberId: await memberId(c.member), c, audit: audit && { ...audit, userId: this.userId } });
        if (id) changeIds.push(id);
      }
    }
    for (const a of orphaned) {
      await tx.delete(attachment).where(and(eq(attachment.memberId, await memberId(a.member)), eq(attachment.relPath, a.relPath)));
    }
    return changeIds;
  }

  /** 新增一条日志：key 在锁内按最新数据分配（create 仍以唯一约束兜底） */
  async addLog(slug: string, data: Record<string, unknown> & { date: string; time?: string }, body: string, opts: { audit?: AuditInfo } = {}) {
    let key = "";
    const changeIds = await this.applyChanges((raw) => {
      key = logKeyFor(data.date, data.time, new Set((raw.docs[slug] ?? []).filter((d) => d.kind === "log").map((d) => d.key)));
      return [{ op: "create", member: slug, kind: "log", key, data, body }];
    }, opts);
    return { key, changeIds };
  }

  /** 改称呼：成员表里的加密姓名与档案里的 name 一起改（同一事务、写锁内） */
  async renameMember(slug: string, name: string) {
    // 与读取时 FamilyMemberSchema 的名字规则一致（不允许换行与 [ ] | # ^）：否则存进去后每次 exportRaw 都会解析失败，整个账号打不开
    const parsed = FamilyMemberSchema.shape.name.safeParse(name);
    const clean = parsed.success ? parsed.data : "";
    if (!parsed.success || clean.length > 40) throw new ImportRejected([{ file: slug, message: "称呼需为 1–40 个字，不能包含换行或 [ ] | # ^" }]);
    const dek = await this.dek();
    await this.db.transaction(async (tx) => {
      await this.lock(tx);
      const [m] = await tx.update(member).set({ nameCipher: seal(dek, clean, nameAad(this.userId, slug)) })
        .where(and(eq(member.userId, this.userId), eq(member.slug, slug))).returning({ id: member.id });
      if (!m) throw new NotFound();
      const profile = await this.readDoc(tx, dek, { memberId: m.id, kind: "profile", key: "" });
      if (profile) await writeDoc(tx, { dek, memberId: m.id, c: { op: "put", member: slug, kind: "profile", key: "", data: { ...profile.data, name: clean }, body: profile.body } });
    });
  }

  /** 只解密一份文档（不必为读一份记录导出整个账号） */
  private async readDoc(q: DB | Tx, dek: Buffer, { memberId, kind, key }: { memberId: string; kind: DocKind; key: string }) {
    const [row] = await q.select({ c: doc.ciphertext }).from(doc).where(and(eq(doc.memberId, memberId), eq(doc.kind, kind), eq(doc.key, key)));
    return row ? (JSON.parse(open(dek, row.c, docAad(memberId, kind, key)).toString()) as { data: Record<string, unknown>; body: string }) : undefined;
  }

  /** 读一份文档（按成员 slug）；不存在返回 undefined */
  async getDoc(slug: string, kind: DocKind, key: string) {
    const m = await this.db.query.member.findFirst({ where: and(eq(member.userId, this.userId), eq(member.slug, slug)) });
    return m ? this.readDoc(this.db, await this.dek(), { memberId: m.id, kind, key }) : undefined;
  }

  /** 最近的 agent 修改（新到旧），附带该文档当前是否仍是这次写入的版本（可还原） */
  async listAgentChanges(limit = 30) {
    const rows = await this.db.select({ c: agentChange, slug: member.slug, cur: doc.contentSha256 }).from(agentChange)
      .innerJoin(member, eq(member.id, agentChange.memberId))
      .leftJoin(doc, and(eq(doc.memberId, agentChange.memberId), eq(doc.kind, agentChange.kind), eq(doc.key, agentChange.key)))
      .where(eq(agentChange.userId, this.userId)).orderBy(desc(agentChange.createdAt)).limit(limit);
    return rows.map(({ c, slug, cur }) => ({
      id: c.id, member: slug, tokenName: c.tokenName, tool: c.tool, kind: c.kind, key: c.key, createdAt: c.createdAt, revertedAt: c.revertedAt,
      revertible: !c.revertedAt && cur === c.newSha256,
    }));
  }

  /** 还原一次 agent 写入：文档必须仍是那次写入后的版本（之后又被改过则拒绝，先还原更新的那次） */
  async revertAgentChange(id: string) {
    await this.db.transaction(async (tx) => {
      await this.lock(tx);
      const [ch] = await tx.select().from(agentChange).where(and(eq(agentChange.id, id), eq(agentChange.userId, this.userId))).for("update");
      if (!ch) throw new NotFound();
      const where = and(eq(doc.memberId, ch.memberId), eq(doc.kind, ch.kind), eq(doc.key, ch.key));
      const [cur] = await tx.select({ sha: doc.contentSha256 }).from(doc).where(where).for("update");
      if (ch.revertedAt || cur?.sha !== ch.newSha256) throw new RevertConflict();
      if (ch.prevCiphertext && ch.prevSha256) await tx.update(doc).set({ ciphertext: ch.prevCiphertext, contentSha256: ch.prevSha256, updatedAt: new Date() }).where(where);
      else await tx.delete(doc).where(where);
      await tx.update(agentChange).set({ revertedAt: new Date() }).where(eq(agentChange.id, id));
    });
  }

  // 附件：委托给 AttachmentStore
  putAttachment(slug: string, relPath: string, data: Buffer, mime: string) { return this.files.put(slug, relPath, data, mime); }
  removeAttachment(slug: string, relPath: string) { return this.files.remove(slug, relPath); }
  getAttachment(slug: string, relPath: string) { return this.files.get(slug, relPath); }
  listAttachments() { return this.files.list(); }
  purgeAttachmentFiles() { return this.files.purgeFiles(); }
}

/** 导入前整批校验：有错误或未知文档类型就整批拒绝，什么都不写 */
function validateImport(raw: RawVault) {
  const errors = buildSnapshot(raw, { root: "import" }).issues.filter((i) => i.level === "error");
  if (errors.length) throw new ImportRejected(errors);
  for (const d of Object.values(raw.docs).flat()) {
    if (!DOC_KINDS.includes(d.kind)) throw new ImportRejected([{ file: d.key, message: `未知类型 ${d.kind}` }]);
  }
}

/** 导入一份文档：内容没变跳过；云端比本地新且未 force 记为冲突；否则更新或新建 */
async function importDoc(tx: Tx, { dek, memberId, d, prev, force }: { dek: Buffer; memberId: string; d: RawDoc; prev?: typeof doc.$inferSelect; force: boolean }) {
  const content = docContent(d);
  const hash = sha256(content);
  if (prev?.contentSha256 === hash) return "unchanged" as const;
  const localTime = d.updatedAt ? new Date(d.updatedAt) : new Date();
  if (prev && !force && prev.updatedAt > localTime) return "conflict" as const;
  const row = { contentSha256: hash, ciphertext: seal(dek, content, docAad(memberId, d.kind, d.key)), updatedAt: localTime };
  if (prev) {
    await tx.update(doc).set(row).where(eq(doc.id, prev.id));
    return "updated" as const;
  }
  await tx.insert(doc).values({ id: randomId(), memberId, kind: d.kind, key: d.key, ...row });
  return "created" as const;
}
