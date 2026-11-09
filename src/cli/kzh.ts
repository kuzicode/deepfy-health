import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  abnormalReadings, ageOn, bmi, lastCheckup, latestReadings, regimenOn, reminders, series, todayISO,
} from "../core/analysis";
import { ZodError } from "zod";
import { Sex } from "../core/schema";
import { VaultRepository, resolveHealthDir, type VaultSnapshot } from "../core/vault";
import { login, pull, push } from "./sync";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
for (const f of [".env.local", ".env"]) {
  const p = path.join(REPO_ROOT, f);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

const HELP = `kzh — 健康分区工具（默认输出 JSON，--pretty 给人看）

  kzh validate                         校验 vault；有 error 时退出码为 1
  kzh members                          成员列表 + 摘要
  kzh member show <id>                 档案 + 最新指标 + 异常 + 提醒
  kzh abnormal <id>                    最新一次检测中的异常指标
  kzh series <id> <CODE>               某指标的历史序列
  kzh catalog [--search 关键字]        指标字典（录入时用别名对齐 code）
  kzh regimen today [<id>] [--date D]  某天要吃的药/补剂（给定时任务）
  kzh reminders [--date D]             体检/复查/补剂到期提醒
  kzh init                             在 vault 中初始化 Personal/（索引、family.yaml、_health/）
  kzh init-member <id> --name N [--dir 目录名] --sex male|female --birth YYYY-MM-DD [--admin]
                                       生成个人主页、兴趣爱好、保险配置与 Health/ 模板

云端（官方托管或自托管实例）：
  kzh login --server URL --token kzh_xxx   保存凭据到 ~/.config/kzh/credentials.json（权限 600）
  kzh push [--dry-run] [--force]           校验通过后把本地 vault 推到云端；云端更新的条目默认跳过
  kzh pull [--into 目录] [--overwrite]      从云端导出到本地（默认当前 vault）；不同的文件另存 *.cloud.md

位置：HEALTH_VAULT_DIR/PERSONAL_SUBDIR（当前：${resolveHealthDir(process.env, REPO_ROOT)}）`;

const { values: opts, positionals: args } = parseArgs({
  allowPositionals: true,
  options: {
    pretty: { type: "boolean" }, date: { type: "string" }, search: { type: "string" },
    name: { type: "string" }, dir: { type: "string" }, sex: { type: "string" }, birth: { type: "string" }, admin: { type: "boolean" },
    help: { type: "boolean", short: "h" },
    server: { type: "string" }, token: { type: "string" }, into: { type: "string" },
    "dry-run": { type: "boolean" }, force: { type: "boolean" }, overwrite: { type: "boolean" },
  },
});

const root = resolveHealthDir(process.env, REPO_ROOT);
const repo = new VaultRepository(root);
const date = opts.date ?? todayISO();

function print(data: unknown) {
  const json = JSON.stringify(data, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v), opts.pretty ? 2 : 0);
  console.log(json);
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

function memberOf(s: VaultSnapshot, id?: string) {
  const m = s.members.find((x) => x.id === id);
  return m ?? fail(`找不到成员 ${id ?? "(未指定)"}；可选：${s.members.map((x) => x.id).join(", ")}`);
}

function summary(s: VaultSnapshot, id: string) {
  const m = memberOf(s, id);
  return {
    id: m.id, name: m.name,
    age: m.profile && ageOn(m.profile.birth_date, date),
    bmi: bmi(m.profile),
    lastCheckup: lastCheckup(m) ?? null,
    abnormalCount: abnormalReadings(m, s.catalog).length,
    reminders: reminders(m, date),
  };
}

function validate(s: VaultSnapshot) {
  const errors = s.issues.filter((i) => i.level === "error");
  if (opts.pretty) {
    for (const i of s.issues) console.log(`${i.level === "error" ? "✗" : "!"} ${i.file}: ${i.message}`);
    console.log(`${errors.length} 个错误，${s.issues.length - errors.length} 个警告（${s.root}）`);
  } else print({ ok: errors.length === 0, root: s.root, issues: s.issues });
  process.exit(errors.length ? 1 : 0);
}

type Handler = (a1?: string, a2?: string) => unknown | Promise<unknown>;

async function initMember(id?: string) {
  const sex = Sex.safeParse(opts.sex);
  if (!id || !opts.name || !sex.success || !opts.birth) fail("用法：kzh init-member <id> --name N [--dir 目录名] --sex male|female --birth YYYY-MM-DD");
  const input = { id, name: opts.name, dir: opts.dir, sex: sex.data, birthDate: opts.birth, role: opts.admin ? "admin" as const : "member" as const };
  try {
    return print({ created: await repo.createMember(input) });
  } catch (e) {
    fail(`建档失败，未写入任何文件：${e instanceof ZodError ? e.issues.map((i) => i.message).join("；") : (e as Error).message}`);
  }
}

const withSnapshot = (fn: (s: VaultSnapshot, a1?: string, a2?: string) => unknown): Handler =>
  async (a1, a2) => fn(await repo.snapshot(), a1, a2);

const COMMANDS: Record<string, Handler> = {
  init: async () => print({ root, copied: await repo.init(path.join(REPO_ROOT, "templates/Personal")) }),
  "init-member": initMember,
  login: async () => print(await login(opts.server, opts.token)),
  push: async () => print(await push(root, { dryRun: opts["dry-run"], force: opts.force })),
  pull: async () => print(await pull(opts.into ? path.resolve(opts.into) : root, { overwrite: opts.overwrite })),
  validate: withSnapshot((s) => validate(s)),
  members: withSnapshot((s) => print(s.members.map((m) => summary(s, m.id)))),
  member: withSnapshot((s, a1, a2) => {
    if (a1 !== "show") fail("用法：kzh member show <id>");
    const m = memberOf(s, a2);
    print({ ...summary(s, m.id), profile: m.profile, latest: latestReadings(m, s.catalog), carePlan: m.carePlan, notes: m.notes });
  }),
  abnormal: withSnapshot((s, a1) => {
    const m = memberOf(s, a1);
    print(abnormalReadings(m, s.catalog).map((r) => ({ ...r, note: m.notes.get(r.code)?.summary })));
  }),
  series: withSnapshot((s, a1, a2) => {
    if (!a2) fail("用法：kzh series <id> <CODE>");
    print({ code: a2, entry: s.catalog.get(a2), points: series(memberOf(s, a1), s.catalog, a2) });
  }),
  catalog: withSnapshot((s) => {
    const q = opts.search?.toLowerCase();
    const all = [...s.catalog.values()];
    print(q ? all.filter((e) => [e.code, e.name, ...e.aliases].some((t) => t.toLowerCase().includes(q))) : all);
  }),
  regimen: withSnapshot((s, a1, a2) => {
    if (a1 !== "today") fail("用法：kzh regimen today [<id>] [--date YYYY-MM-DD]");
    print({ date, slots: (a2 ? [memberOf(s, a2)] : s.members).flatMap((m) => regimenOn(m, date)) });
  }),
  reminders: withSnapshot((s) => print({ date, reminders: s.members.flatMap((m) => reminders(m, date)) })),
};

async function main() {
  const [cmd, a1, a2] = args;
  if (opts.help || !cmd) return console.log(HELP);
  const handler = COMMANDS[cmd] ?? fail(`未知命令 ${cmd}\n\n${HELP}`);
  try {
    await handler(a1, a2);
  } catch (e) {
    fail((e as Error).message);
  }
}

await main();
