"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireUser, userRepository } from "@/server/session";
import { masterKey } from "@/server/crypto";
import { RevertConflict, ensureUserKey } from "@/server/pg-repository";
import { QuotaExceeded } from "@/server/quota";
import { asScope, createToken, revealToken, revokeToken, rotateToken, setTokenScope } from "@/server/tokens";

// 身份只来自 session（SEC6）：token 的增删改都限定在当前用户名下

const dekOf = (userId: string) => ensureUserKey(getDb(), userId, masterKey());

/** 再次取回已有接入的 token（只限本人；旧 token 没有密文时返回空，界面提示重新生成） */
export async function revealTokenAction(id: string): Promise<{ token?: string }> {
  const u = await requireUser();
  return { token: await revealToken(getDb(), u.id, id, await dekOf(u.id)) };
}

export async function createTokenAction(_prev: { token?: string; quota?: number }, form: FormData): Promise<{ token?: string; quota?: number }> {
  const u = await requireUser();
  try {
    const token = await createToken(getDb(), u.id, String(form.get("name") ?? ""), { dek: await dekOf(u.id), scope: form.get("write") ? "write" : "read" });
    revalidatePath("/agents");
    return { token };
  } catch (e) {
    if (e instanceof QuotaExceeded) return { quota: e.limit };
    throw e;
  }
}

export async function rotateTokenAction(_prev: { token?: string }, form: FormData): Promise<{ token?: string }> {
  const u = await requireUser();
  const token = await rotateToken(getDb(), u.id, String(form.get("id") ?? ""), await dekOf(u.id));
  revalidatePath("/agents");
  return { token };
}

export async function revokeTokenAction(form: FormData) {
  const u = await requireUser();
  await revokeToken(getDb(), u.id, String(form.get("id")));
  revalidatePath("/agents");
}

export async function setScopeAction(form: FormData) {
  const u = await requireUser();
  await setTokenScope(getDb(), u.id, String(form.get("id")), asScope(form.get("scope")));
  revalidatePath("/agents");
}

/** 还原一次 agent 写入；文档之后又被改过时不还原（列表里会显示原因） */
export async function revertChangeAction(form: FormData) {
  const repo = await userRepository();
  await repo.revertAgentChange(String(form.get("id"))).catch((e) => { if (!(e instanceof RevertConflict)) throw e; });
  revalidatePath("/agents");
  revalidatePath("/", "layout");
}
