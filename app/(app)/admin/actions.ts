"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { user } from "@/db/schema";
import { addAllowedEmail, disableTarget, removeAllowedEmail, setDisabled } from "@/server/access";
import { getAuth } from "@/server/auth";
import { masterKey } from "@/server/crypto";
import { isSelfHosted } from "@/server/edition";
import { PgRepository } from "@/server/pg-repository";
import { requireAdmin } from "@/server/session";
import { approvedRequest, decide, deliverInvite } from "@/server/waitlist";

export async function addAllowedAction(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  try {
    await addAllowedEmail(getDb(), String(form.get("email") ?? ""), String(form.get("note") ?? ""), admin.email);
  } catch {
    return { error: "invalid" };
  }
  revalidatePath("/admin");
  return {};
}

export async function removeAllowedAction(form: FormData) {
  await requireAdmin();
  await removeAllowedEmail(getDb(), String(form.get("email") ?? ""));
  revalidatePath("/admin");
}

export async function setDisabledAction(form: FormData) {
  const admin = await requireAdmin();
  const userId = String(form.get("userId") ?? "");
  const target = await disableTarget(getDb(), admin.id, userId);
  if (!target) return;
  await setDisabled(getDb(), target.id, form.get("disable") === "1");
  revalidatePath("/admin");
}

/** 审批早鸟申请：通过 → 加入已开通名单并发邀请邮件；拒绝只改状态，不通知 */
export async function decideWaitlistAction(form: FormData) {
  const admin = await requireAdmin();
  const row = await decide(getDb(), String(form.get("email") ?? ""), form.get("approve") === "1", admin.email);
  if (row) showInviteResult(form, await deliverInvite(row));
  revalidatePath("/admin");
}

/** 重发邀请：只对已通过的申请有效 */
export async function resendInviteAction(form: FormData) {
  await requireAdmin();
  const row = await approvedRequest(getDb(), String(form.get("email") ?? ""));
  if (row) showInviteResult(form, await deliverInvite(row));
  revalidatePath("/admin");
}

/** 结果放进地址里显示，停留在当前筛选。不带邮箱，免得进访问日志 */
function showInviteResult(form: FormData, sent: boolean): never {
  revalidatePath("/admin");
  const params = new URLSearchParams({ invite: sent ? "sent" : "failed" });
  const wl = String(form.get("wl") ?? "");
  if (wl) params.set("wl", wl);
  redirect(`/admin?${params}`);
}

// ---------- 自托管版：账号管理（所有者添加家人账号、重置密码、删除） ----------

export type AccountFormState = { error?: "exists" | "invalid" | "generic" | "mismatch"; done?: boolean };

const field = (form: FormData, k: string) => String(form.get(k) ?? "");
const apiCode = (e: unknown) => (e as { body?: { code?: string } }).body?.code;
const apiStatus = (e: unknown) => (e as { statusCode?: number }).statusCode;

/** 停用、重置密码、删除的目标：不能是自己、其他管理员和所有者（见 disableTarget） */
async function manageableTarget(form: FormData) {
  const admin = await requireAdmin();
  if (!isSelfHosted()) return undefined;
  return disableTarget(getDb(), admin.id, field(form, "userId"));
}

export async function addUserAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  await requireAdmin();
  if (!isSelfHosted()) return { error: "generic" };
  try {
    await getAuth().api.kzCreateUser({ body: { name: field(form, "name"), email: field(form, "email"), password: field(form, "password") } });
  } catch (e) {
    return { error: apiCode(e) === "user_exists" ? "exists" : apiStatus(e) === 400 ? "invalid" : "generic" };
  }
  revalidatePath("/admin");
  return { done: true };
}

export async function resetUserPasswordAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const target = await manageableTarget(form);
  const password = field(form, "password");
  if (!target) return { error: "generic" };
  if (password.length < 8 || password.length > 128) return { error: "invalid" };
  await getAuth().api.kzSetUserPassword({ body: { userId: target.id, password } });
  revalidatePath("/admin");
  return { done: true };
}

/** 删除账号：先删磁盘上的附件密文，再删账号（档案、密钥、token、会话级联删除） */
export async function deleteUserAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const target = await manageableTarget(form);
  if (!target) return { error: "generic" };
  if (field(form, "confirm").trim().toLowerCase() !== target.email.toLowerCase()) return { error: "mismatch" };
  await new PgRepository(getDb(), target.id, masterKey()).purgeAttachmentFiles();
  await getDb().delete(user).where(eq(user.id, target.id));
  revalidatePath("/admin");
  return { done: true };
}
