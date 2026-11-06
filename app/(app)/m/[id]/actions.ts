"use server";

import { revalidatePath } from "next/cache";
import { todayISO } from "@/core/analysis";
import type { RawDoc } from "@/core/bundle";
import type { Profile } from "@/core/schema";
import { AVATARS } from "@/avatars";
import { ImportRejected, NotFound } from "@/server/pg-repository";
import {
  type ActionState, LogForm, logPhotoPath, MAX_PHOTO_BYTES, MAX_PHOTOS, MeasureForm, ProfileForm, manualRecordKey, mergeMeasures, patchProfile, sniffImage,
} from "@/server/quick-entry";
import { QuotaExceeded } from "@/server/quota";
import { requireUser, userRepository } from "@/server/session";
import { getDb } from "@/db/client";
import { submitFeedback } from "@/server/catalog-feedback";
import { createLimiter } from "@/server/login-lookup";
import { ToolError } from "@/mcp/tools";
import { removeItemDoc, saveItemDoc, stopItemDoc } from "@/mcp/regimen-write";
import { scheduleChanges } from "@/mcp/write";
import { AdoptForm, parseRegimenForm, StopForm } from "@/server/regimen-form";

// 成员页的网页编辑：身份只来自 session（SEC6），表单一律 zod 校验，写入走 PgRepository.applyChanges 的整体校验

const fields = (form: FormData) => Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));

async function guard<T>(fn: () => Promise<T>): Promise<ActionState> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof ImportRejected) return { error: e.issues.map((i) => i.message).join("；").slice(0, 300) };
    if (e instanceof NotFound) return { error: "not_found" };
    if (e instanceof ToolError) return { error: "invalid" };
    if (e instanceof QuotaExceeded) return { error: `quota_${e.resource}` };
    if (e instanceof Error && e.message.startsWith("photo_")) return { error: e.message };
    console.error("quick entry failed", e instanceof Error ? e.name : "unknown"); // 数据库错误可能带查询参数，不打完整对象
    return { error: "generic" };
  }
}

type Repo = Awaited<ReturnType<typeof userRepository>>;

/** 照片路径与日志 key 无关且随机，并发请求互不覆盖；失败回滚只删本请求上传的 */
async function uploadPhoto(repo: Repo, member: string, date: string, file: File) {
  if (file.size > MAX_PHOTO_BYTES) throw new Error("photo_size");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) throw new Error("photo_type");
  const rel = logPhotoPath(date, kind.ext);
  await repo.putAttachment(member, rel, buf, kind.mime);
  return rel;
}

export async function addLogAction(member: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = LogForm.safeParse(fields(form));
  if (!parsed.success) return { error: "invalid" };
  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > MAX_PHOTOS) return { error: "photo_count" };
  const repo = await userRepository();
  const res = await guard(async () => {
    const { body, ...f } = parsed.data;
    const uploaded: string[] = [];
    try {
      for (const file of photos) uploaded.push(await uploadPhoto(repo, member, f.date, file));
      await repo.addLog(member, { ...f, attachments: uploaded }, body.trim());
    } catch (e) {
      await Promise.all(uploaded.map((rel) => repo.removeAttachment(member, rel).catch(() => {})));
      throw e;
    }
  });
  revalidatePath(`/m/${member}`, "layout");
  return res;
}

export async function addMeasuresAction(member: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = MeasureForm.safeParse(fields(form));
  if (!parsed.success) return { error: "invalid" };
  const repo = await userRepository();
  const res = await guard(async () => {
    const key = manualRecordKey(parsed.data.date);
    // 在写锁内读取当天记录再合并，并发的另一次记录不会被覆盖
    await repo.applyChanges((raw) => {
      const prev = raw.docs[member]?.find((d) => d.kind === "record" && d.key === key);
      if (prev && prev.data.type !== "manual") throw new ImportRejected([{ file: key, message: "同名记录不是手动记录" }]);
      const next = mergeMeasures(prev, parsed.data);
      if (!next) throw new ImportRejected([{ file: key, message: "empty" }]);
      return [{ op: "put", member, kind: "record", key, ...next }];
    });
  });
  revalidatePath(`/m/${member}`, "layout");
  return res;
}

export async function updateProfileAction(member: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = ProfileForm.safeParse(fields(form));
  if (!parsed.success) return { error: "invalid" };
  const repo = await userRepository();
  const res = await guard(async () => {
    await repo.applyChanges((raw) => {
      const prev = raw.docs[member]?.find((d) => d.kind === "profile");
      if (!prev) throw new NotFound();
      return [{ op: "put", member, kind: "profile", key: "", data: patchProfile(prev.data as Profile, parsed.data, todayISO()), body: prev.body }];
    });
  });
  revalidatePath(`/m/${member}`, "layout");
  return res;
}

export async function deleteLogAction(member: string, form: FormData) {
  await requireUser();
  const key = String(form.get("key") ?? "");
  const repo = await userRepository();
  await guard(() => repo.applyChanges([{ op: "delete", member, kind: "log", key }]));
  revalidatePath(`/m/${member}`, "layout");
}

const feedbackLimit = createLimiter(5, 60_000);
// 同一账号同一份报告只计一次（进程内记录，重启后清空——只影响排序信号，不值得为它把账号与反馈关联落库）
const feedbackSent = new Set<string>();

/**
 * 字典缺口反馈：名称取自用户自己这份记录的 other_items（不信任客户端传来的内容），
 * 只提交名称 / 单位 / 分组，不带数值、不关联账号。
 */
export async function catalogFeedbackAction(member: string, recordKey: string): Promise<ActionState & { count?: number }> {
  const u = await requireUser();
  if (!feedbackLimit(u.id)) return { error: "rate_limited" };
  const once = `${u.id}\u0000${member}\u0000${recordKey}`;
  const rec = await (await userRepository()).getDoc(member, "record", recordKey);
  const items = ((rec?.data.other_items as { name: string; unit?: string; section?: string }[] | undefined) ?? [])
    .slice(0, 50).map((x) => ({ name: x.name, unit: x.unit, section: x.section }));
  if (!items.length) return { error: "not_found" };
  if (feedbackSent.has(once)) return { ok: true, count: 0 };
  const count = await submitFeedback(getDb(), items);
  feedbackSent.add(once);
  return { ok: true, count };
}

/** 换家人头像：只接受清单里的 id；写在档案 avatar 字段，不改 updated（只是外观） */
export async function setMemberAvatarAction(member: string, avatar: string): Promise<ActionState> {
  await requireUser();
  if (!AVATARS.includes(avatar)) return { error: "invalid" };
  const repo = await userRepository();
  const res = await guard(() => repo.applyChanges((raw) => {
    const prev = raw.docs[member]?.find((d) => d.kind === "profile");
    if (!prev) throw new NotFound();
    return [{ op: "put", member, kind: "profile", key: "", data: { ...prev.data, avatar }, body: prev.body }];
  }));
  revalidatePath("/", "layout"); // 家庭页、顶部成员切换器也要更新
  return res;
}

export async function renameMemberAction(member: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const name = String(form.get("name") ?? "");
  const repo = await userRepository();
  const res = await guard(() => repo.renameMember(member, name));
  revalidatePath("/", "layout"); // 顶部成员切换器、家庭页也要更新
  return res;
}

/** 「接下来」：改复查 / 体检日期，或确认已检查（与 MCP update_schedule 同一个 builder，在写锁内读改写） */
export async function scheduleAction(member: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const kind = form.get("kind") === "checkup" ? "checkup" : "recheck";
  const action = form.get("action") === "reschedule" ? "reschedule" : "done";
  const codes = String(form.get("codes") ?? "").split(",").map((c) => c.trim()).filter(Boolean).slice(0, 30);
  const date = String(form.get("date") ?? "") || undefined;
  const repo = await userRepository();
  const res = await guard(() => repo.applyChanges((raw) => scheduleChanges(raw, member, { kind, codes, action, date }, todayISO())));
  if (res.ok) revalidatePath(`/m/${member}`);
  return res;
}

/** 用药 / 补剂：新增或编辑一条（与 MCP 共用同一个 builder，在写锁内读改写；其他条目和正文不动） */
export async function saveRegimenAction(member: string, id: string | undefined, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const patch = parseRegimenForm(form);
  if (!patch) return { error: "invalid" };
  return regimenWrite(member, (prev, today) => saveItemDoc(prev, { ...patch, id }, today).doc);
}

export async function stopRegimenAction(member: string, id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = StopForm.safeParse(fields(form));
  if (!parsed.success) return { error: "invalid" };
  return regimenWrite(member, (prev, today) => stopItemDoc(prev, { id, on: parsed.data.stopped_on, reason: parsed.data.stop_reason }, today).doc);
}

/** 采纳 agent 建议：开始日期按今天算；有结束日期的由用户重新确认 */
export async function adoptRegimenAction(member: string, id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = AdoptForm.safeParse(fields(form));
  if (!parsed.success) return { error: "invalid" };
  return regimenWrite(member, (prev, today) => saveItemDoc(prev, { id, status: "active", end: parsed.data.end }, today).doc);
}

export async function deleteRegimenAction(member: string, id: string): Promise<ActionState> {
  await requireUser();
  return regimenWrite(member, (prev, today) => removeItemDoc(prev, id, today));
}

async function regimenWrite(member: string, build: (prev: RawDoc | undefined, today: string) => { data: Record<string, unknown>; body: string }) {
  const repo = await userRepository();
  const res = await guard(() => repo.applyChanges((raw) => {
    if (!raw.family.members.some((m) => m.id === member)) throw new NotFound();
    const prev = raw.docs[member]?.find((d) => d.kind === "regimen");
    return [{ op: "put", member, kind: "regimen", key: "", ...build(prev, todayISO()) }];
  }));
  revalidatePath(`/m/${member}`, "layout");
  return res;
}
