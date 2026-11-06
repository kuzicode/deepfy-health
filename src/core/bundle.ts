import matter from "gray-matter";
import YAML from "yaml";
import type { z } from "zod";
import { unitsComparable } from "./analysis";
import { BUILTIN_CATALOG } from "./builtin-catalog";
import {

  CarePlanSchema, IndicatorNoteSchema, LogSchema, ProfileSchema, RecordSchema, RegimenSchema,
  type Catalog, type CatalogEntry, type Family, type HealthLog, type HealthRecord, type IndicatorNote, type MemberBundle, type ValidationIssue,
} from "./schema";

/** 字典登记的备用单位（不可直接换算）且带了报告参考范围：能判定高低，只是趋势按单位分开，不必警告 */
export const altUnitWithRange = (r: { unit?: string; ref_low?: number; ref_high?: number }, entry: { alt_units?: string[] }) =>
  !!r.unit && (entry.alt_units ?? []).some((u) => u.toLowerCase() === r.unit!.trim().toLowerCase()) && (r.ref_low !== undefined || r.ref_high !== undefined);

// 本地 vault 与云端数据库共用的中间格式：frontmatter 原样保留，校验与组装统一在 buildSnapshot 里做

export const DOC_KINDS = ["profile", "record", "note", "regimen", "care_plan", "log"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/** updatedAt：本地为文件修改时间，云端为最后写入时间（ISO），用于推送时的冲突判断 */
export interface RawDoc { kind: DocKind; key: string; data: Record<string, unknown>; body: string; updatedAt?: string }

export interface RawVault {
  family: Family;
  customCatalog: CatalogEntry[];
  docs: Record<string, RawDoc[]>; // 按成员 id
}

export interface VaultSnapshot {
  root: string;
  family: Family;
  catalog: Catalog;
  members: MemberBundle[];
  issues: ValidationIssue[];
}

export interface HealthReader {
  snapshot(): Promise<VaultSnapshot>;
  getMember(id: string): Promise<{ member: MemberBundle; catalog: Catalog } | undefined>;
}

export const CATALOG_FILE = "_health/indicators.yaml";

/**
 * 文档 key 会拼进本地文件路径（kzh pull、导出），必须是安全的单个文件名：
 * 单例文档为空；指标笔记是 code；检测记录不含路径分隔符、控制字符和 ".."，不以 "." 开头
 */
export function isSafeDocKey(kind: DocKind, key: string): boolean {
  if (kind === "profile" || kind === "regimen" || kind === "care_plan") return key === "";
  if (kind === "note") return /^[A-Z0-9_]{1,40}$/.test(key);
  if (kind === "log") return /^\d{8}-\d{4}(-\d{1,2})?$/.test(key);
  return key.length > 0 && key.length <= 200 && !/[/\\\u0000-\u001f]/.test(key) && !key.includes("..") && !key.startsWith(".");
}

/** 文档在 Personal/ 下的相对路径，校验信息与 kzh pull 都用它 */
export function docPath(m: { id: string; dir?: string }, d: { kind: DocKind; key: string }): string {
  const base = `${m.dir ?? m.id}/Health`;
  switch (d.kind) {
    case "profile": return `${base}/profile.md`;
    case "regimen": return `${base}/regimen.md`;
    case "care_plan": return `${base}/care-plan.md`;
    case "record": return `${base}/records/${d.key}.md`;
    case "note": return `${base}/indicators/${d.key}.md`;
    case "log": return `${base}/logs/${d.key}.md`;
  }
}

export const parseMd = (raw: string) => matter(raw, { engines: { yaml: (s: string) => YAML.parse(s) ?? {} } });

// Obsidian/agent 常留空字段（`height_cm:`），YAML 解析为 null，按“未填写”处理
export function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.filter((x) => x !== null).map(stripNulls);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, stripNulls(x)]));
  }
  return v;
}

export class Issues {
  list: ValidationIssue[] = [];
  error = (file: string, message: string) => void this.list.push({ level: "error", file, message });
  warn = (file: string, message: string) => void this.list.push({ level: "warning", file, message });

  parse<S extends z.ZodType>(schema: S, data: unknown, file: string): z.infer<S> | undefined {
    const res = schema.safeParse(stripNulls(data));
    if (res.success) return res.data;
    for (const i of res.error.issues) this.error(file, `${i.path.join(".") || "(root)"}: ${i.message}`);
    return undefined;
  }
}

export function mergeCatalog(custom: CatalogEntry[]): Catalog {
  const catalog: Catalog = new Map(BUILTIN_CATALOG.map((e) => [e.code, e]));
  for (const e of custom) catalog.set(e.code, e);
  return catalog;
}

interface Ctx { issues: Issues; catalog: Catalog; attachmentExists?: (memberId: string, relPath: string) => boolean }
type FM = Family["members"][number];

/** 附件引用都要存在（记录与日志共用） */
function checkAttachments(ctx: Ctx, fm: FM, file: string, attachments: string[]) {
  if (!ctx.attachmentExists) return;
  for (const a of attachments) if (!ctx.attachmentExists(fm.id, a)) ctx.issues.warn(file, `附件不存在：${a}`);
}

/** 指标单位和字典不一致时的提示（登记过的备用单位且带报告范围时不提示） */
function unitWarning(r: HealthRecord["indicators"][number], entry: CatalogEntry): string | undefined {
  if (unitsComparable(r, entry) || altUnitWithRange(r, entry)) return undefined;
  const fix = r.ref_low === undefined && r.ref_high === undefined
    ? "，且未写参考范围，无法判定——请补 ref_low/ref_high 或换算单位"
    : "，与其他单位的历史数据不进同一趋势图";
  return `${r.code} 单位 ${r.unit} 与 catalog 的 ${entry.unit} 不一致${fix}`;
}

function checkRecord(ctx: Ctx, fm: FM, file: string, rec: HealthRecord) {
  const compact = rec.date.replaceAll("-", "");
  if (!rec.slug.startsWith(rec.date) && !rec.slug.startsWith(`${compact} `)) {
    ctx.issues.warn(file, `文件名应以记录日期开头，如「${compact} ${rec.title}.md」`);
  }
  checkAttachments(ctx, fm, file, rec.attachments);
  for (const r of rec.indicators) {
    const entry = ctx.catalog.get(r.code);
    if (!entry) { ctx.issues.error(file, `未知指标 code ${r.code}（${r.name ?? ""}）——先加入 ${CATALOG_FILE}`); continue; }
    const warn = unitWarning(r, entry);
    if (warn) ctx.issues.warn(file, warn);
  }
}

function checkNote(ctx: Ctx, file: string, key: string, note: IndicatorNote) {
  if (key !== note.code) ctx.issues.warn(file, `文件名应为 ${note.code}.md`);
  if (!ctx.catalog.has(note.code)) ctx.issues.warn(file, `未知指标 code ${note.code}`);
}

type Parse = <S extends z.ZodType>(schema: S, d: RawDoc) => (z.infer<S> & { body: string }) | undefined;
interface Collected { records: HealthRecord[]; notes: Map<string, IndicatorNote>; logs: HealthLog[] }

interface MemberCtx { ctx: Ctx; fm: FM; parse: Parse }

/** 把一份记录 / 日志 / 笔记文档校验后放进对应的集合 */
function collectDoc({ ctx, fm, parse }: MemberCtx, d: RawDoc, out: Collected) {
  const file = docPath(fm, d);
  if (d.kind === "record") {
    const rec = parse(RecordSchema, d);
    if (!rec) return;
    checkRecord(ctx, fm, file, { ...rec, slug: d.key });
    out.records.push({ ...rec, slug: d.key });
  } else if (d.kind === "log") {
    const log = parse(LogSchema, d);
    if (!log) return;
    const day = log.date.replaceAll("-", "");
    if (!d.key.startsWith(day)) ctx.issues.warn(file, `文件名应以日志日期开头，如「${day}-0900.md」`);
    checkAttachments(ctx, fm, file, log.attachments);
    out.logs.push({ ...log, slug: d.key });
  } else if (d.kind === "note") {
    const note = parse(IndicatorNoteSchema, d);
    if (!note) return;
    checkNote(ctx, file, d.key, note);
    out.notes.set(note.code, note);
  }
}

/** 档案：缺失只警告；id 与 family.yaml 不一致时返回 false（不加载该目录） */
function loadProfile({ ctx, fm, parse }: MemberCtx, doc: RawDoc | undefined) {
  if (!doc) ctx.issues.warn(`${fm.dir ?? fm.id}/Health`, "缺少 Health/profile.md（可用 kzh init-member 生成）");
  const profile = doc && parse(ProfileSchema, doc);
  if (profile && profile.id !== fm.id) {
    ctx.issues.error(docPath(fm, doc!), `id ${profile.id} 与 family.yaml 中的 ${fm.id} 不一致，已不加载该目录的健康数据`);
    return false;
  }
  return profile;
}

function loadRegimen({ ctx, fm, parse }: MemberCtx, doc: RawDoc | undefined) {
  const regimen = doc && parse(RegimenSchema, doc);
  for (const item of regimen?.items ?? []) {
    for (const c of item.related) if (!ctx.catalog.has(c)) ctx.issues.warn(docPath(fm, doc!), `${item.id}.related 含未知指标 ${c}`);
  }
  return regimen;
}

const newestFirst = (a: HealthLog, b: HealthLog) => `${b.date}${b.time ?? ""}${b.slug}`.localeCompare(`${a.date}${a.time ?? ""}${a.slug}`);

function buildMember(ctx: Ctx, fm: FM, docs: RawDoc[]): MemberBundle {
  const empty: MemberBundle = { id: fm.id, name: fm.name, dir: fm.dir, role: fm.role, records: [], notes: new Map(), logs: [] };
  const parse: Parse = (schema, d) => {
    const v = ctx.issues.parse(schema, d.data, docPath(fm, d));
    return v && { ...v, body: d.body.trim() };
  };
  const mc: MemberCtx = { ctx, fm, parse };
  const single = (kind: DocKind) => docs.find((d) => d.kind === kind);

  const profile = loadProfile(mc, single("profile"));
  if (profile === false) return empty;

  const out: Collected = { records: [], notes: new Map(), logs: [] };
  for (const d of [...docs].sort((a, b) => a.key.localeCompare(b.key))) {
    if (isSafeDocKey(d.kind, d.key)) collectDoc(mc, d, out);
    else ctx.issues.error(`${fm.dir ?? fm.id}/Health`, `非法的${d.kind}文档名：${JSON.stringify(d.key).slice(0, 60)}`);
  }
  out.logs.sort(newestFirst);
  const carePlanDoc = single("care_plan");
  return { ...empty, profile, ...out, regimen: loadRegimen(mc, single("regimen")), carePlan: carePlanDoc && parse(CarePlanSchema, carePlanDoc) };
}

export function buildSnapshot(
  raw: RawVault,
  opts: { root: string; issues?: Issues; attachmentExists?: Ctx["attachmentExists"] },
): VaultSnapshot {
  const issues = opts.issues ?? new Issues();
  const catalog = mergeCatalog(raw.customCatalog);
  const ctx: Ctx = { issues, catalog, attachmentExists: opts.attachmentExists };
  const members = raw.family.members.map((fm) => buildMember(ctx, fm, raw.docs[fm.id] ?? []));
  return { root: opts.root, family: raw.family, catalog, members, issues: issues.list };
}
