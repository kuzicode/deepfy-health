"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { user } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { setAvatar } from "@/server/avatar";
import { requireUser, userRepository } from "@/server/session";

export async function deleteAccountAction(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const u = await requireUser();
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== u.email.toLowerCase()) {
    return { error: "mismatch" };
  }
  await (await userRepository()).purgeAttachmentFiles();
  await getDb().delete(user).where(eq(user.id, u.id)); // 档案、密钥、token、会话随之级联删除
  redirect("/login");
}

/** 换预设头像：只接受清单里的 id（setAvatar 校验） */
export async function setAvatarAction(form: FormData) {
  const u = await requireUser();
  await setAvatar(getDb(), u.id, String(form.get("avatar") ?? ""));
  revalidatePath("/", "layout");
}
