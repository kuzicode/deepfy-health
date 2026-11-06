import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RawVault } from "../core/bundle";
import { rawToFiles, sameContent } from "../core/serialize";
import { loadVault, readVaultRaw, healthDir } from "../core/vault";

// kzh login / push / pull：本地 vault ↔ 云端（云端为主，本地手动推拉做备份）

interface Credentials { server: string; token: string }
const CRED_FILE = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "kzh", "credentials.json");
const sha256 = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const MIME: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".heic": "image/heic" };

function credentials(): Credentials {
  if (!fs.existsSync(CRED_FILE)) throw new Error("还没有登录：先运行 kzh login --server <地址> --token <token>");
  return JSON.parse(fs.readFileSync(CRED_FILE, "utf8"));
}

async function api(c: Credentials, method: string, route: string, { body, type = "application/json", retries = 3 }: { body?: BodyInit; type?: string; retries?: number } = {}): Promise<Response> {
  const res = await fetch(new URL(route, c.server), {
    method, body, headers: { authorization: `Bearer ${c.token}`, ...(body ? { "content-type": type } : {}) },
  });
  if (res.status === 429 && retries > 0) {
    await new Promise((r) => setTimeout(r, Number(res.headers.get("retry-after") ?? 60) * 1000));
    return api(c, method, route, { body, type, retries: retries - 1 });
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${method} ${route} → ${res.status} ${detail.slice(0, 2000)}`);
  }
  return res;
}

export async function login(server: string | undefined, token: string | undefined) {
  if (!server || !token) throw new Error("用法：kzh login --server https://app.deepfy.si --token kzh_xxx");
  const c = { server: server.replace(/\/$/, ""), token };
  const me = await (await api(c, "GET", "/api/v1/me")).json();
  fs.mkdirSync(path.dirname(CRED_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(CRED_FILE, JSON.stringify(c, null, 2), { mode: 0o600 });
  return { ok: true, server: c.server, account: me.email, saved: CRED_FILE };
}

export type Remote = { vault: RawVault; attachments: { member: string; relPath: string; sha256: string }[] };

/** 记录和日志引用的附件路径 */
const attachmentRefs = (d: RawVault["docs"][string][number]) =>
  d.kind === "record" || d.kind === "log" ? ((d.data.attachments as string[] | undefined) ?? []) : [];

export function localAttachments(root: string, raw: RawVault) {
  return raw.family.members.flatMap((fm) =>
    (raw.docs[fm.id] ?? []).flatMap(attachmentRefs)
      .map((rel) => ({ member: fm.id, relPath: rel, file: path.join(healthDir(root, fm), rel) }))
      .filter((a) => fs.existsSync(a.file)));
}

export async function push(root: string, opts: { dryRun?: boolean; force?: boolean }) {
  const errors = loadVault(root).issues.filter((i) => i.level === "error");
  if (errors.length) return { ok: false, reason: "本地校验有错误，未推送（先运行 kzh validate --pretty）", errors };
  const c = credentials();
  const raw = readVaultRaw(root);
  const atts = localAttachments(root, raw);
  if (opts.dryRun) return { ok: true, dryRun: true, members: raw.family.members.length, docs: Object.values(raw.docs).flat().length, attachments: atts.length };

  const result = await (await api(c, "POST", `/api/v1/import${opts.force ? "?force=1" : ""}`, { body: JSON.stringify(raw) })).json();
  const remote: Remote = await (await api(c, "GET", "/api/v1/export")).json();
  const remoteSha = new Map(remote.attachments.map((a) => [`${a.member}/${a.relPath}`, a.sha256]));
  let uploaded = 0;
  for (const a of atts) {
    const data = fs.readFileSync(a.file);
    if (remoteSha.get(`${a.member}/${a.relPath}`) === sha256(data)) continue;
    const route = `/api/v1/attachments/${encodeURIComponent(a.member)}/${a.relPath.split("/").map(encodeURIComponent).join("/")}`;
    await api(c, "PUT", route, { body: new Uint8Array(data), type: MIME[path.extname(a.file).toLowerCase()] ?? "application/octet-stream" });
    uploaded++;
  }
  return { ok: true, ...result, attachmentsUploaded: uploaded, hint: result.conflicts?.length ? "云端有更新的版本，已跳过；确认要覆盖时加 --force" : undefined };
}

interface PullStep { rel: string; target: string; kind: "file" | "attachment"; content?: string; member?: string; relPath?: string; conflict: boolean }
export interface PullPlan { steps: PullStep[]; unchanged: number; conflictDir: string }

/** 目标路径必须落在 root 之内（防止云端数据里的路径越界写文件） */
function assertInside(root: string, file: string) {
  const r = path.resolve(root);
  const f = path.resolve(file);
  if (f !== r && !f.startsWith(r + path.sep)) throw new Error(`路径越界，已中止，未写入任何文件：${file}`);
}

/**
 * 先算出所有写入并整体校验，再执行。与本地不同的文件（含附件）默认写进 _conflicts/<时间>/，
 * 加载器会忽略以 _ 开头的目录，冲突副本不会被当成正式记录；--overwrite 才直接覆盖
 */
export function planPull(remote: Remote, into: string, opts: { overwrite?: boolean; stamp: string }): PullPlan {
  const conflictDir = path.join(into, "_conflicts", opts.stamp);
  const steps: PullStep[] = [];
  let unchanged = 0;
  const place = (rel: string, differs: boolean) => (differs && !opts.overwrite ? { target: path.join(conflictDir, rel), conflict: true } : { target: path.join(into, rel), conflict: false });

  for (const [rel, content] of Object.entries(rawToFiles(remote.vault))) {
    const file = path.join(into, rel);
    assertInside(into, file);
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
    if (existing !== undefined && sameContent(rel, existing, content)) { unchanged++; continue; }
    steps.push({ rel, kind: "file", content, ...place(rel, existing !== undefined) });
  }
  for (const a of remote.attachments) {
    const fm = remote.vault.family.members.find((m) => m.id === a.member);
    if (!fm) continue;
    const file = path.join(healthDir(into, fm), a.relPath);
    assertInside(healthDir(into, fm), file);
    const rel = path.relative(into, file);
    const exists = fs.existsSync(file);
    if (exists && sha256(fs.readFileSync(file)) === a.sha256) { unchanged++; continue; }
    steps.push({ rel, kind: "attachment", member: a.member, relPath: a.relPath, ...place(rel, exists) });
  }
  for (const st of steps) assertInside(into, st.target);
  return { steps, unchanged, conflictDir };
}

export async function pull(into: string, opts: { overwrite?: boolean }) {
  const c = credentials();
  const remote: Remote = await (await api(c, "GET", "/api/v1/export")).json();
  const plan = planPull(remote, into, { overwrite: opts.overwrite, stamp: new Date().toISOString().replace(/[:.]/g, "-") });
  for (const st of plan.steps) {
    const data = st.kind === "file" ? st.content! : Buffer.from(await (await api(c, "GET",
      `/api/v1/attachments/${encodeURIComponent(st.member!)}/${st.relPath!.split("/").map(encodeURIComponent).join("/")}`)).arrayBuffer());
    fs.mkdirSync(path.dirname(st.target), { recursive: true });
    fs.writeFileSync(st.target, data);
  }
  const conflicts = plan.steps.filter((s) => s.conflict).map((s) => s.rel);
  return {
    ok: true, into, written: plan.steps.length - conflicts.length, unchanged: plan.unchanged, conflicts,
    hint: conflicts.length ? `本地与云端不同的 ${conflicts.length} 个文件已存到 ${path.relative(into, plan.conflictDir)}/（不会被加载）；核对后可用 --overwrite 直接覆盖` : undefined,
  };
}
