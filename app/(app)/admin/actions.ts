"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { disableTarget, setDisabled } from "@/server/access";
import { requireAdmin } from "@/server/session";

/** 拉黑 / 解除拉黑：拉黑后立即下线，token 失效，邮箱不能重新注册 */
export async function setDisabledAction(form: FormData) {
  const admin = await requireAdmin();
  const userId = String(form.get("userId") ?? "");
  const target = await disableTarget(getDb(), admin.id, userId);
  if (!target) return;
  await setDisabled(getDb(), target.id, form.get("disable") === "1");
  revalidatePath("/admin");
}
