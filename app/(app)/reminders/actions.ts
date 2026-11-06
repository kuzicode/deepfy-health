"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { getDb } from "@/db/client";
import { createLimiter } from "@/server/login-lookup";
import { sendReminderCode } from "@/server/mail";
import { confirmEmailChange, getSetting, requestEmailChange, setEnabled, setLeadDays } from "@/server/reminders";
import { requireUser } from "@/server/session";

// 身份只来自 session（SEC6）；发信类操作按账号限速，避免被用来轰炸邮箱

export type FormState = { ok?: boolean; error?: string; stage?: "code" };

const DAY_MS = 86_400_000;
const mailLimit = createLimiter(5, 10 * 60 * 1000);
// 验证邮箱会发信到任意地址：限制每个账号、每个收件人和全站每天的数量，避免骚扰别人或用光发信额度影响登录验证码
const perAccountDay = createLimiter(10, DAY_MS);
const perRecipientDay = createLimiter(3, DAY_MS);
const sitewideDay = createLimiter(200, DAY_MS);
const mayMail = (userId: string, to: string) => perAccountDay(userId) && perRecipientDay(to.trim().toLowerCase()) && sitewideDay("all");
const done = () => revalidatePath("/reminders");

export async function toggleAction(form: FormData) {
  const u = await requireUser();
  await setEnabled(getDb(), u.id, form.get("enabled") === "1");
  done();
}

export async function leadDaysAction(form: FormData) {
  const u = await requireUser();
  await setLeadDays(getDb(), u.id, form.getAll("lead").map(Number));
  done();
}

export async function emailAction(_prev: FormState, form: FormData): Promise<FormState> {
  const u = await requireUser();
  const code = String(form.get("code") ?? "").trim();
  if (code) {
    const ok = await confirmEmailChange(getDb(), u.id, code);
    if (!ok) return { stage: "code", error: "badCode" };
    done();
    return { ok: true };
  }
  if (!mailLimit(u.id)) return { error: "tooMany" };
  try {
    const r = await requestEmailChange(getDb(), u.id, u.email, String(form.get("email") ?? ""));
    if (r.reset) { done(); return { ok: true }; }
    const s = await getSetting(getDb(), u.id);
    const to = s!.pendingEmail!;
    if (!mayMail(u.id, to)) return { error: "tooMany" };
    await sendReminderCode(to, r.code!, await getLocale());
    return { stage: "code" };
  } catch {
    return { error: "badEmail" };
  }
}

