import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { DOC_KINDS, Issues, buildRecipes, buildSnapshot, memberFromDocs, isSafeHouseholdDocKey, type HouseholdDocKind, type RawHouseholdDoc, type DocKind, type HealthReader, type RawDoc, type RawVault, type VaultSnapshot } from "@/core/bundle";
import type { Recipe } from "@/core/recipe";
import { FamilyMemberSchema } from "@/core/schema";
import type { DB } from "@/db/client";
import { attachment, doc, household, householdDoc, member } from "@/db/schema";
import { open, randomId, seal, sha256 } from "./crypto";
import { AttachmentStore } from "./attachment-store";
import { assertHouseholdDocSize, mergeChange, referencesAttachment, writeDoc, writeHouseholdDoc } from "./doc-write";
import { listAgentChanges, revertChange } from "./agent-changes";
import { importDoc, importHouseholdDocs } from "./import-doc";
import { logKey as logKeyFor } from "./quick-entry";
import { QuotaExceeded, assertDocQuota, assertQuota, limitsOf, lockUser } from "./quota";
import { ImportRejected, NotFound, hdocAad, isHouseholdChange, docAad, docContent, ensureUserKey, nameAad, type AuditInfo, type Change, type ImportResult, type Tx } from "./repo-base";

// 对外入口：类型与错误定义在 repo-base，写文档在 doc-write，附件在 attachment-store；调用方只从这里导入
export { ImportRejected, KeyTaken, NotFound, RevertConflict, ensureUserKey, type AuditInfo, type Change, type ImportResult } from "./repo-base";

interface ChangeOptions {
  audit?: AuditInfo;
  scope?: "household";
  /** 与文档和审计一同提交，事务回滚后的无引用密文由 GC 延迟回收。 */
  coverUpload?: { relPath: string; data: Buffer; mime: string };
}

function memberStub(m: typeof member.$inferSelect, dek: Buffer) {
  return FamilyMemberSchema.parse({
    id: m.slug, name: open(dek, m.nameCipher, nameAad(m.userId, m.slug)).toString(), role: m.role, dir: m.dir ?? undefined,
  });
}

function openDoc(dek: Buffer, row: typeof doc.$inferSelect): RawDoc {
  const { data, body } = JSON.parse(open(dek, row.ciphertext, docAad(row.memberId, row.kind, row.key)).toString());
  return { kind: row.kind as DocKind, key: row.key, data, body, updatedAt: row.updatedAt.toISOString() };
}

/** 当前登录用户的云端数据；所有查询都按 userId 限定（SEC） */
export class PgRepository implements HealthReader {
  private dekPromise?: Promise<Buffer>;
  private readonly files: AttachmentStore;
  constructor(private readonly db: DB, readonly userId: string, private readonly kek: Buffer) {
    this.files = new AttachmentStore({ db, userId, dek: () => this.dek(), lock: (tx) => this.lock(tx), members: (tx) => this.members(tx) });
  }

  private dek() {
    this.dekPromise ??= ensureUserKey(this.db, this.userId, this.kek);
    return this.dekPromise;
  }

  private async members(q: DB | Tx = this.db) {
    // 稳定顺序：按添加先后（同一次导入里时间相同，再按 slug），否则 Postgres 返回顺序不确定，家人列表会跳动
    return q.select().from(member).where(eq(member.userId, this.userId)).orderBy(sql`${member.position} asc nulls last`, asc(member.createdAt), asc(member.slug));
  }

  /** 同一账号的所有写入串行化（事务级 advisory lock，提交或回滚时自动释放）：读取—合并—写入在锁内完成，避免并发覆盖 */
  private lock(tx: Tx) {
    return lockUser(tx, this.userId);
  }

  /** q 传事务时在锁内读取（applyChanges 用） */
  async exportRaw(q: DB | Tx = this.db): Promise<RawVault> {
    const dek = await this.dek();
    const [hh, members, householdDocs] = await Promise.all([
      q.query.household.findFirst({ where: eq(household.userId, this.userId) }),
      this.members(q), this.readHouseholdDocs(q, dek),
    ]);
    const docs = members.length ? await q.select().from(doc).where(inArray(doc.memberId, members.map((m) => m.id))) : [];
    const family = {
      family: hh?.name ?? undefined,
      members: members.map((m) => memberStub(m, dek)),
    };
    const out: Record<string, RawDoc[]> = Object.fromEntries(members.map((m) => [m.slug, []]));
    for (const d of docs) {
      const m = members.find((x) => x.id === d.memberId)!;
      out[m.slug].push(openDoc(dek, d));
    }
    return { family, customCatalog: (hh?.customCatalog ?? []) as RawVault["customCatalog"], docs: out, householdDocs };
  }

  async snapshot(): Promise<VaultSnapshot> {
    const raw = await this.exportRaw();
    const members = await this.members();
    const atts = members.length ? await this.db.select({ memberId: attachment.memberId, relPath: attachment.relPath }).from(attachment).where(inArray(attachment.memberId, members.map((m) => m.id))) : [];
    const have = new Set(atts.map((a) => `${members.find((m) => m.id === a.memberId)!.slug}/${a.relPath}`));
    const covers = new Set((await this.listHouseholdAttachments()).map((a) => a.relPath));
    return buildSnapshot(raw, { root: "cloud", householdAttachmentExists: (rel) => covers.has(rel), attachmentExists: (id, rel) => have.has(`${id}/${rel}`) });
  }

  async listMemberStubs() {
    const members = await this.members();
    if (!members.length) return [];
    const dek = await this.dek();
    return members.map((m) => memberStub(m, dek));
  }

  private async readHouseholdDocs(q: DB | Tx, dek: Buffer, filter?: { kind: HouseholdDocKind; key?: string }): Promise<RawHouseholdDoc[]> {
    const rows = await q.select().from(householdDoc).where(and(
      eq(householdDoc.userId, this.userId), filter && eq(householdDoc.kind, filter.kind),
      filter?.key !== undefined ? eq(householdDoc.key, filter.key) : undefined,
    ));
    return rows.map((row) => {
      const { data, body } = JSON.parse(open(dek, row.ciphertext, hdocAad(this.userId, row.kind, row.key)).toString());
      return { kind: row.kind as HouseholdDocKind, key: row.key, data, body, updatedAt: row.updatedAt.toISOString() };
    });
  }

  async listRecipes(): Promise<Recipe[]> {
    const docs = await this.readHouseholdDocs(this.db, await this.dek(), { kind: "recipe" });
    return buildRecipes(docs, new Issues());
  }

  async getRecipe(slug: string) {
    if (!isSafeHouseholdDocKey("recipe", slug)) return undefined;
    const docs = await this.readHouseholdDocs(this.db, await this.dek(), { kind: "recipe", key: slug });
    return buildRecipes(docs, new Issues())[0];
  }

  async getMember(id: string) {
    const m = await this.db.query.member.findFirst({ where: and(eq(member.userId, this.userId), eq(member.slug, id)) });
    if (!m) return undefined;
    const [dek, rows, hh] = await Promise.all([
      this.dek(), this.db.select().from(doc).where(eq(doc.memberId, m.id)),
      this.db.query.household.findFirst({ columns: { customCatalog: true }, where: eq(household.userId, this.userId) }),
    ]);
    return memberFromDocs(memberStub(m, dek), rows.map((d) => openDoc(dek, d)), (hh?.customCatalog ?? []) as RawVault["customCatalog"]);
  }

  /** 保存家人的显示顺序。必须正好是这个账号的全部家人，否则不改（页面过期时刷新后重排） */
  async reorderMembers(slugs: string[]) {
    await this.db.transaction(async (tx) => {
      await this.lock(tx);
      const known = (await this.members(tx)).map((m) => m.slug).sort();
      if (JSON.stringify([...slugs].sort()) !== JSON.stringify(known)) throw new NotFound();
      for (const [position, slug] of slugs.entries()) {
        await tx.update(member).set({ position }).where(and(eq(member.userId, this.userId), eq(member.slug, slug)));
      }
    });
  }

  /** 整批校验通过才写入；云端版本比本地新时不覆盖（除非 force） */
  async importRaw(raw: RawVault, opts: { force?: boolean } = {}): Promise<ImportResult> {
    const maxDocs = (await limitsOf(this.db, this.userId)).docs;
    const householdDocs = raw.householdDocs ?? [];
    if (Object.values(raw.docs).flat().length + householdDocs.length > maxDocs) throw new QuotaExceeded("docs", maxDocs);
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
      await importHouseholdDocs(tx, householdDocs, result, { userId: this.userId, dek, force: !!opts.force });
      await assertDocQuota(tx, this.userId);
    });
    return result;
  }

  /**
   * 单点修改：在当前数据上合并改动，用 buildSnapshot 校验（只看被改文件的错误，已有数据的旧问题不阻塞网页编辑），
   * 通过后只写改动的文档；不碰 household 与自定义指标。删除日志时一并删掉它的附件记录（密文文件由 GC 延迟清理）。
   * changes 可以是函数：在锁内拿到最新数据再算出改动（读—改—写不会被并发请求覆盖）。
   * 返回 agent 修改记录的 id（成员写入与家庭变更在传入 audit 时记录）。
   */
  async applyChanges(input: Change[] | ((raw: RawVault) => Change[] | Promise<Change[]>), opts: ChangeOptions = {}): Promise<string[]> {
    const dek = await this.dek();
    return this.db.transaction(async (tx) => {
      await this.lock(tx);
      const raw: RawVault = opts.scope === "household"
        ? { family: { members: [] }, docs: {}, customCatalog: [], householdDocs: await this.readHouseholdDocs(tx, dek) }
        : await this.exportRaw(tx);
      const changes = typeof input === "function" ? await input(structuredClone(raw)) : input;
      if (opts.scope === "household" && !changes.every(isHouseholdChange)) throw new NotFound();
      await this.checkChangeQuota(tx, changes, opts.audit);
      const touched = new Set<string>();
      const removedAttachments: { member: string; relPath: string }[] = [];
      for (const c of changes) mergeChange(raw, c, touched, removedAttachments);
      // 只删除改动后已无任何文档引用的附件（导入的数据里多份记录可能共用同一个文件）
      const stillUsed = (m: string, rel: string) => (raw.docs[m] ?? []).some((d) => referencesAttachment(d, rel));
      const orphaned = removedAttachments.filter((a) => !stillUsed(a.member, a.relPath));
      const errors = buildSnapshot(raw, { root: "web" }).issues.filter((x) => x.level === "error" && touched.has(x.file));
      if (errors.length) throw new ImportRejected(errors);
      if (opts.coverUpload) {
        const { relPath, data, mime } = opts.coverUpload;
        await this.files.putHousehold(relPath, data, mime, tx);
      }
      const ids = await this.writeChanges(tx, { dek, raw, changes, orphaned, audit: opts.audit });
      await assertDocQuota(tx, this.userId);
      return ids;
    });
  }

  private async checkChangeQuota(tx: Tx, changes: Change[], audit?: AuditInfo) {
    const newMembers = changes.filter((c) => c.op === "add_member").length;
    if (newMembers) await assertQuota(tx, this.userId, "members", newMembers);
    const audited = audit ? changes.filter((c) => c.op === "put" || c.op === "create" || isHouseholdChange(c)).length : 0;
    if (audited) await assertQuota(tx, this.userId, "mcpWritesPerDay", audited);
  }

  private async writeChanges(tx: Tx, { dek, raw, changes, orphaned, audit }: { dek: Buffer; raw: RawVault; changes: Change[]; orphaned: { member: string; relPath: string }[]; audit?: AuditInfo }) {
    const changeIds: string[] = [];
    const memberId = async (slug: string) =>
      (await tx.select({ id: member.id }).from(member).where(and(eq(member.userId, this.userId), eq(member.slug, slug))))[0].id;
    for (const c of changes) {
      if (isHouseholdChange(c)) {
        const id = await writeHouseholdDoc(tx, { dek, userId: this.userId, c, audit });
        if (id) changeIds.push(id);
      } else if (c.op === "add_member") {
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
  listAgentChanges(limit = 30) {
    return listAgentChanges(this.db, this.userId, limit);
  }

  async revertAgentChange(id: string) {
    await this.db.transaction(async (tx) => {
      await this.lock(tx);
      await revertChange(tx, this.userId, id);
    });
  }

  // 附件：委托给 AttachmentStore
  putAttachment(slug: string, relPath: string, data: Buffer, mime: string) { return this.files.put(slug, relPath, data, mime); }
  removeAttachment(slug: string, relPath: string) { return this.files.remove(slug, relPath); }
  getAttachment(slug: string, relPath: string) { return this.files.get(slug, relPath); }
  listAttachments() { return this.files.list(); }
  putHouseholdAttachment(relPath: string, data: Buffer, mime: string) { return this.files.putHousehold(relPath, data, mime); }
  removeHouseholdAttachment(relPath: string) { return this.files.removeHousehold(relPath); }
  getHouseholdAttachment(relPath: string) { return this.files.getHousehold(relPath); }
  listHouseholdAttachments() { return this.files.listHousehold(); }
  purgeAttachmentFiles() { return this.files.purgeFiles(); }
}

/** 导入前整批校验：有错误或未知文档类型就整批拒绝，什么都不写 */
function validateImport(raw: RawVault) {
  const errors = buildSnapshot(raw, { root: "import" }).issues.filter((i) => i.level === "error");
  if (errors.length) throw new ImportRejected(errors);
  for (const d of raw.householdDocs ?? []) assertHouseholdDocSize(d);
  for (const d of Object.values(raw.docs).flat()) {
    if (!DOC_KINDS.includes(d.kind)) throw new ImportRejected([{ file: d.key, message: `未知类型 ${d.kind}` }]);
  }
}
