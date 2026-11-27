import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RawVault } from "../core/bundle";
import { assertHouseholdAttachmentPath } from "../core/household-attachment";
import { RECIPE_DIR } from "../core/recipe";
import { recipeTemplates } from "../core/recipe-templates";
import { rawToFiles, sameContent } from "../core/serialize";
import { loadVault, readVaultRaw, healthDir, obsidianLinkPrefix } from "../core/vault";

// kzh login / push / pull：本地 vault ↔ 云端（云端为主，本地手动推拉做备份）

interface Credentials { server: string; token: string }
const credentialsFile = () => path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "kzh", "credentials.json");
const sha256 = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const MIME: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".heic": "image/heic" };

function credentials(): Credentials {
  const file = credentialsFile();
  if (!fs.existsSync(file)) throw new Error("还没有登录：先运行 kzh login --server <地址> --token <token>");
  return JSON.parse(fs.readFileSync(file, "utf8"));
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
  const file = credentialsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(c, null, 2), { mode: 0o600 });
  return { ok: true, server: c.server, account: me.email, saved: file };
}

type RemoteFile = { relPath: string; sha256: string };
type AttachmentRef = { member?: string; relPath: string };
type LocalFile = AttachmentRef & { file: string };
export type Remote = { vault: RawVault; attachments: (RemoteFile & { member: string })[]; householdAttachments?: RemoteFile[] };

/** 记录和日志引用的附件路径 */
const attachmentRefs = (d: RawVault["docs"][string][number]) =>
  d.kind === "record" || d.kind === "log" ? ((d.data.attachments as string[] | undefined) ?? []) : [];

export function localAttachments(root: string, raw: RawVault) {
  return raw.family.members.flatMap((fm) =>
    (raw.docs[fm.id] ?? []).flatMap(attachmentRefs)
      .map((rel) => ({ member: fm.id, relPath: rel, file: path.join(healthDir(root, fm), rel) }))
      .filter((a) => fs.existsSync(a.file)));
}

export function localHouseholdAttachments(root: string, raw: Pick<RawVault, "householdDocs">, remotePaths?: Set<string>) {
  const covers = new Set<string>();
  for (const doc of raw.householdDocs ?? []) {
    if (doc.kind === "recipe" && typeof doc.data.cover === "string") covers.add(`${RECIPE_DIR}/${doc.data.cover}`);
  }
  const files: LocalFile[] = [];
  for (const relPath of covers) {
    assertHouseholdAttachmentPath(relPath);
    const file = path.join(root, relPath);
    assertInside(root, file);
    if (fs.existsSync(file)) files.push({ relPath, file });
    else if (remotePaths && !remotePaths.has(relPath)) throw new Error(`找不到菜谱封面：${relPath}`);
  }
  return files;
}

function coversForPush(root: string, raw: RawVault, remote: Remote, force = false) {
  const docs = raw.householdDocs ?? [];
  if (!docs.length) return [];
  if (remote.householdAttachments === undefined) throw new Error("服务端不支持家庭菜谱同步，请升级服务端后再推送。");
  const remoteTimes = new Map((remote.vault.householdDocs ?? []).filter((d) => d.kind === "recipe").map((d) => [d.key, d.updatedAt]));
  // 先筛引用、再按封面去重。同图仍有一份菜谱可导入时，照常上传。
  const householdDocs = force ? docs : docs.filter((d) => {
    const remoteTime = remoteTimes.get(d.key);
    return !remoteTime || !d.updatedAt || Date.parse(d.updatedAt) >= Date.parse(remoteTime);
  });
  return localHouseholdAttachments(root, { householdDocs }, new Set(remote.householdAttachments.map((a) => a.relPath)));
}

function attachmentRoute(a: AttachmentRef) {
  const prefix = a.member === undefined ? "household-attachments" : `attachments/${encodeURIComponent(a.member)}`;
  return `/api/v1/${prefix}/${a.relPath.split("/").map(encodeURIComponent).join("/")}`;
}

async function uploadChanged(c: Credentials, files: LocalFile[], hashes: Map<string, string>) {
  let count = 0;
  for (const a of files) {
    const data = fs.readFileSync(a.file);
    const route = attachmentRoute(a);
    if (hashes.get(route) === sha256(data)) continue;
    await api(c, "PUT", route, { body: new Uint8Array(data), type: MIME[path.extname(a.file).toLowerCase()] ?? "application/octet-stream" });
    count++;
  }
  return count;
}

export async function push(root: string, opts: { dryRun?: boolean; force?: boolean }) {
  const errors = loadVault(root).issues.filter((i) => i.level === "error");
  if (errors.length) return { ok: false, reason: "本地校验有错误，未推送（先运行 kzh validate --pretty）", errors };
  const c = credentials();
  const raw = readVaultRaw(root);
  const atts = localAttachments(root, raw);
  if (opts.dryRun) return {
    ok: true, dryRun: true, members: raw.family.members.length,
    docs: Object.values(raw.docs).flat().length + (raw.householdDocs?.length ?? 0), attachments: atts.length + localHouseholdAttachments(root, raw).length,
  };

  const remote: Remote = await (await api(c, "GET", "/api/v1/export")).json();
  const covers = remote.householdAttachments ?? [];
  const local = coversForPush(root, raw, remote, opts.force);
  const hashes = new Map([...covers, ...remote.attachments].map((a) => [attachmentRoute(a), a.sha256]));
  const imagesUploaded = await uploadChanged(c, local, hashes);
  const result = await (await api(c, "POST", `/api/v1/import${opts.force ? "?force=1" : ""}`, { body: JSON.stringify(raw) })).json();
  const uploaded = imagesUploaded + await uploadChanged(c, atts, hashes);
  return { ok: true, ...result, attachmentsUploaded: uploaded, hint: result.conflicts?.length ? "云端有更新的版本，已跳过；确认要覆盖时加 --force" : undefined };
}

type PullStep = { rel: string; target: string; conflict: boolean } & (
  | { kind: "file"; content: string }
  | ({ kind: "attachment"; content?: undefined } & AttachmentRef & RemoteFile)
);
export interface PullPlan { steps: PullStep[]; unchanged: number; conflictDir: string }

/** 目标路径必须落在 root 之内（防止云端数据里的路径越界写文件） */
function assertInside(root: string, file: string) {
  const r = path.resolve(root);
  const f = path.resolve(file);
  if (f !== r && !f.startsWith(r + path.sep)) throw new Error(`路径越界，已中止，未写入任何文件：${file}`);
  for (let dir = f; dir !== r; dir = path.dirname(dir)) {
    if (fs.lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`路径越界，目标包含符号链接：${dir}`);
  }
}

function* remoteFiles(remote: Remote, into: string) {
  for (const a of remote.attachments) {
    const fm = remote.vault.family.members.find((m) => m.id === a.member);
    if (!fm) continue;
    const base = healthDir(into, fm);
    const file = path.join(base, a.relPath);
    assertInside(base, file);
    yield { ref: a, file };
  }
  for (const a of remote.householdAttachments ?? []) {
    assertHouseholdAttachmentPath(a.relPath);
    const file = path.join(into, a.relPath);
    yield { ref: { relPath: a.relPath, sha256: a.sha256 }, file };
  }
}

function missingTemplates(remote: Remote, into: string) {
  if (!remote.vault.householdDocs?.some((d) => d.kind === "recipe")) return [];
  const templates = recipeTemplates(path.resolve(import.meta.dirname, "../.."), obsidianLinkPrefix(into));
  return Object.entries(templates).filter(([rel]) => !fs.existsSync(path.join(into, rel)));
}

function checkPullTarget(root: string, file: string, seen: Set<string>) {
  assertInside(root, file);
  const key = path.resolve(file).toLowerCase();
  if (seen.has(key)) throw new Error(`拉取路径重复或大小写冲突：${file}`);
  seen.add(key);
}

/**
 * 先算出所有写入并整体校验，再执行。与本地不同的文件（含附件）默认写进 _conflicts/<时间>/，
 * 加载器会忽略以 _ 开头的目录，冲突副本不会被当成正式记录；--overwrite 才直接覆盖
 */
export function planPull(remote: Remote, into: string, opts: { overwrite?: boolean; stamp: string }): PullPlan {
  const conflictDir = path.join(into, "_conflicts", opts.stamp);
  const steps: PullStep[] = [];
  const destinations = new Set<string>();
  let unchanged = 0;
  const place = (rel: string, differs: boolean) => (differs && !opts.overwrite ? { target: path.join(conflictDir, rel), conflict: true } : { target: path.join(into, rel), conflict: false });

  for (const [rel, content] of [...Object.entries(rawToFiles(remote.vault)), ...missingTemplates(remote, into)]) {
    const file = path.join(into, rel);
    checkPullTarget(into, file, destinations);
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
    if (existing !== undefined && sameContent(rel, existing, content)) { unchanged++; continue; }
    steps.push({ rel, kind: "file", content, ...place(rel, existing !== undefined) });
  }
  for (const { ref, file } of remoteFiles(remote, into)) {
    checkPullTarget(into, file, destinations);
    const exists = fs.existsSync(file);
    if (exists && sha256(fs.readFileSync(file)) === ref.sha256) { unchanged++; continue; }
    const rel = path.relative(into, file);
    steps.push({ ...ref, rel, kind: "attachment", ...place(rel, exists) });
  }
  const targets = new Set<string>();
  for (const st of steps) checkPullTarget(into, st.target, targets);
  return { steps, unchanged, conflictDir };
}

async function downloadVerified(c: Credentials, st: Extract<PullStep, { kind: "attachment" }>) {
  const data = Buffer.from(await (await api(c, "GET", attachmentRoute(st))).arrayBuffer());
  if (sha256(data) !== st.sha256) throw new Error(`附件 SHA-256 校验失败：${st.rel}`);
  return data;
}

export async function pull(into: string, opts: { overwrite?: boolean }) {
  const c = credentials();
  const remote: Remote = await (await api(c, "GET", "/api/v1/export")).json();
  const plan = planPull(remote, into, { overwrite: opts.overwrite, stamp: new Date().toISOString().replace(/[:.]/g, "-") });
  const writes = new Map<string, string | Buffer>();
  for (const st of plan.steps) {
    writes.set(st.target, st.kind === "file" ? st.content : await downloadVerified(c, st));
  }
  for (const target of writes.keys()) assertInside(into, target);
  for (const [target, data] of writes) {
    assertInside(into, target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  const conflicts = plan.steps.filter((s) => s.conflict).map((s) => s.rel);
  return {
    ok: true, into, written: plan.steps.length - conflicts.length, unchanged: plan.unchanged, conflicts,
    hint: conflicts.length ? `本地与云端不同的 ${conflicts.length} 个文件已存到 ${path.relative(into, plan.conflictDir)}/（不会被加载）；核对后可用 --overwrite 直接覆盖` : undefined,
  };
}
