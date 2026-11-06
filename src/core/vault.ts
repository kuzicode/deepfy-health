import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  CATALOG_FILE, DOC_KINDS, Issues, buildSnapshot, docPath, parseMd, stripNulls,
  type DocKind, type HealthReader, type RawDoc, type RawVault, type VaultSnapshot,
} from "./bundle";
import { CatalogFileSchema, FamilyMemberSchema, FamilySchema, ProfileSchema, type Family, type Profile } from "./schema";
import { memberTemplates } from "./templates";

export { type VaultSnapshot };
const MEMBERS_END = "%% members:end %%";

export interface NewMember { id: string; name: string; dir?: string; sex: Profile["sex"]; birthDate: string; role?: "admin" | "member" }

/** 本地 vault 额外支持建档与初始化；网站只依赖 HealthReader */
export interface HealthRepository extends HealthReader {
  createMember(input: NewMember): Promise<string[]>;
  init(templatesDir: string): Promise<string[]>;
}

/** 个人目录：Personal/<dir>，dir 默认等于 id */
const memberDir = (root: string, m: { id: string; dir?: string }) => path.join(root, m.dir ?? m.id);
export const healthDir = (root: string, m: { id: string; dir?: string }) => path.join(memberDir(root, m), "Health");

/** Obsidian 库内完整路径前缀：向上找含 .obsidian 的目录；找不到就用相对链接 */
export function obsidianLinkPrefix(root: string): string {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".obsidian"))) {
      const rel = path.relative(dir, root).split(path.sep).join("/");
      return rel ? `${rel}/` : "";
    }
    if (path.dirname(dir) === dir) return "";
  }
}

export function resolveHealthDir(env: Record<string, string | undefined> = process.env, cwd = process.cwd()): string {
  const vault = env.HEALTH_VAULT_DIR
    ? path.resolve(/*turbopackIgnore: true*/ cwd, env.HEALTH_VAULT_DIR)
    : path.join(/*turbopackIgnore: true*/ cwd, "examples/sample-vault");
  return path.join(/*turbopackIgnore: true*/ vault, env.PERSONAL_SUBDIR || "Personal");
}



function readYaml(issues: Issues, file: string, rel: string): unknown {
  if (!fs.existsSync(file)) return undefined;
  try {
    return YAML.parse(fs.readFileSync(file, "utf8")) ?? {};
  } catch (e) {
    issues.error(rel, `YAML 解析失败：${(e as Error).message}`);
  }
}

function readDoc(issues: Issues, root: string, kind: DocKind, key: string, fm: { id: string; dir?: string }): RawDoc | undefined {
  const rel = docPath(fm, { kind, key });
  const file = path.join(/*turbopackIgnore: true*/ root, rel);
  if (!fs.existsSync(file)) return undefined;
  try {
    const { data, content } = parseMd(fs.readFileSync(file, "utf8"));
    return { kind, key, data, body: content, updatedAt: fs.statSync(file).mtime.toISOString() };
  } catch (e) {
    issues.error(rel, `frontmatter 解析失败：${(e as Error).message}`);
  }
}

const mdKeys = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_")).map((f) => f.slice(0, -3)).sort() : [];

function readMemberDocs(issues: Issues, root: string, fm: Family["members"][number]): RawDoc[] {
  const hd = healthDir(root, fm);
  const keys: [DocKind, string][] = [
    ...DOC_KINDS.filter((k) => k !== "record" && k !== "note" && k !== "log").map((k): [DocKind, string] => [k, ""]),
    ...mdKeys(path.join(hd, "records")).map((k): [DocKind, string] => ["record", k]),
    ...mdKeys(path.join(hd, "indicators")).map((k): [DocKind, string] => ["note", k]),
    ...mdKeys(path.join(hd, "logs")).map((k): [DocKind, string] => ["log", k]),
  ];
  return keys.map(([kind, key]) => readDoc(issues, root, kind, key, fm)).filter((d): d is RawDoc => !!d);
}

/** 读 vault 为中间格式；family.yaml / indicators.yaml 在这里校验 */
export function readVaultRaw(root: string, issues = new Issues()): RawVault {
  if (!fs.existsSync(path.join(root, "family.yaml"))) issues.error("family.yaml", "缺少 family.yaml（可用 kzh init 初始化）");
  const family = issues.parse(FamilySchema, readYaml(issues, path.join(root, "family.yaml"), "family.yaml") ?? {}, "family.yaml") ?? { members: [] };
  const custom = issues.parse(CatalogFileSchema, readYaml(issues, path.join(root, CATALOG_FILE), CATALOG_FILE) ?? {}, CATALOG_FILE);
  const docs = Object.fromEntries(family.members.map((fm) => [fm.id, readMemberDocs(issues, root, fm)]));

  const known = new Set(family.members.map((m) => m.dir ?? m.id));
  if (fs.existsSync(root)) {
    for (const d of fs.readdirSync(root, { withFileTypes: true })) {
      if (d.isDirectory() && !/^[._]/.test(d.name) && !known.has(d.name)) issues.warn(d.name, "目录不在 family.yaml 的 members 里，已忽略");
    }
  }
  return { family, customCatalog: custom?.indicators ?? [], docs };
}

export function loadVault(root: string): VaultSnapshot {
  const issues = new Issues();
  const raw = readVaultRaw(root, issues);
  const byId = new Map(raw.family.members.map((m) => [m.id, m]));
  return buildSnapshot(raw, {
    root,
    issues,
    attachmentExists: (id, rel) => fs.existsSync(path.join(/*turbopackIgnore: true*/ healthDir(root, byId.get(id)!), rel)),
  });
}

export class VaultRepository implements HealthRepository {
  constructor(readonly root: string) {}

  async snapshot() {
    return loadVault(this.root);
  }

  async getMember(id: string) {
    const s = loadVault(this.root);
    const member = s.members.find((m) => m.id === id);
    return member && { member, catalog: s.catalog };
  }

  async createMember(input: NewMember) {
    const plan = planMember(this.root, input);
    for (const [file, content] of plan.files) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    for (const sub of ["records", "indicators", "logs", "attachments"]) fs.mkdirSync(path.join(/*turbopackIgnore: true*/ plan.health, sub), { recursive: true });
    if (plan.index) fs.writeFileSync(plan.index.file, plan.index.content);
    fs.writeFileSync(plan.familyFile, plan.family);
    return [...plan.files.map(([f]) => f), ...(plan.index ? [plan.index.file] : []), plan.familyFile];
  }

  async init(templatesDir: string) {
    const prefix = obsidianLinkPrefix(this.root);
    const copied: string[] = [];
    const walk = (dir: string) => {
      for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        const from = path.join(dir, d.name);
        const to = path.join(this.root, path.relative(templatesDir, from));
        if (d.isDirectory()) walk(from);
        else if (!fs.existsSync(to)) {
          fs.mkdirSync(path.dirname(to), { recursive: true });
          fs.writeFileSync(to, fs.readFileSync(from, "utf8").replaceAll("{{PREFIX}}", prefix));
          copied.push(to);
        }
      }
    };
    walk(templatesDir);
    return copied;
  }
}

function assertNoConflict(family: Family, id: string, dir: string, personDir: string) {
  if (family.members.some((m) => m.id === id)) throw new Error(`成员 ${id} 已存在`);
  if (family.members.some((m) => (m.dir ?? m.id).toLowerCase() === dir.toLowerCase())) {
    throw new Error(`目录 ${dir} 与已有成员的目录冲突（不区分大小写）`);
  }
  // 大小写不敏感的文件系统上 kz 与 KZ 是同一目录；已有 Health/ 一律拒绝，绝不把旧档案挂到新成员名下
  if (fs.existsSync(path.join(/*turbopackIgnore: true*/ personDir, "Health"))) throw new Error(`目录 ${dir} 下已有健康档案`);
}

interface MemberPlan { files: [string, string][]; health: string; familyFile: string; family: string; index?: { file: string; content: string } }

/** 先算出所有要写的内容并全部校验，任何一步失败都不落盘 */
function planMember(root: string, input: NewMember): MemberPlan {
  const fm = FamilyMemberSchema.parse({ id: input.id, name: input.name, role: input.role ?? "member", dir: input.dir });
  const dir = fm.dir ?? fm.id;
  const personDir = memberDir(root, fm);
  if (path.dirname(personDir) !== path.resolve(root)) throw new Error(`目录 ${dir} 不在 ${root} 之下`);

  const familyFile = path.join(root, "family.yaml");
  const doc = fs.existsSync(familyFile) ? YAML.parseDocument(fs.readFileSync(familyFile, "utf8")) : new YAML.Document({ members: [] });
  assertNoConflict(FamilySchema.parse(doc.toJS() ?? {}), fm.id, dir, personDir);
  doc.addIn(["members"], { id: fm.id, name: fm.name, role: fm.role, ...(fm.dir ? { dir: fm.dir } : {}) });
  const seq = doc.get("members", true);
  if (YAML.isSeq(seq)) seq.flow = false;
  FamilySchema.parse(doc.toJS());

  const linkBase = obsidianLinkPrefix(root);
  const templates = memberTemplates({ id: fm.id, name: fm.name, dir, sex: input.sex, birthDate: input.birthDate, linkBase });
  ProfileSchema.parse(stripNulls(parseMd(templates["Health/profile.md"]).data));
  const files = Object.entries(templates)
    .map(([rel, content]): [string, string] => [path.join(personDir, rel), content])
    .filter(([file]) => !fs.existsSync(file));

  return { files, health: path.join(personDir, "Health"), familyFile, family: doc.toString(), index: planIndex(root, linkBase, dir, fm.name) };
}

function planIndex(root: string, linkBase: string, dir: string, name: string) {
  const file = path.join(root, "Personal.md");
  if (!fs.existsSync(file)) return undefined;
  const text = fs.readFileSync(file, "utf8");
  const line = `- [[${linkBase}${dir}/${dir}|${name}]]`;
  if (text.includes(`[[${linkBase}${dir}/${dir}|`)) return undefined;
  const content = text.includes(MEMBERS_END) ? text.replace(MEMBERS_END, `${line}\n${MEMBERS_END}`) : `${text.trimEnd()}\n${line}\n`;
  return { file, content };
}

export const defaultRepository = (): HealthRepository => new VaultRepository(resolveHealthDir());
