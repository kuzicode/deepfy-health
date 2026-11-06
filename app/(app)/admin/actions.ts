"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { addAllowedEmail, disableTarget, removeAllowedEmail, setDisabled } from "@/server/access";
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
