"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { addAllowedEmail, disableTarget, removeAllowedEmail, setDisabled } from "@/server/access";
import { toLocale } from "@/i18n/config";
import { sendInviteEmail } from "@/server/mail";
import { requireAdmin } from "@/server/session";
import { decide } from "@/server/waitlist";

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

/** 审批抢先体验申请：通过 → 加入已开通名单并发邀请邮件；拒绝只改状态，不通知 */
export async function decideWaitlistAction(form: FormData) {
  const admin = await requireAdmin();
  const row = await decide(getDb(), String(form.get("email") ?? ""), form.get("approve") === "1", admin.email);
  if (row) await sendInviteEmail(row.email, toLocale(row.locale)).catch((e) => console.error("invite mail failed", e));
  revalidatePath("/admin");
}
