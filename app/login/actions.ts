"use server";

import { headers } from "next/headers";
import { getAuth } from "@/server/auth";

/** 邮箱验证成功后设置密码：此时已证明邮箱归属，且验证前的密码已被作废（见 auth.ts）；已有密码时 better-auth 会拒绝 */
export async function setInitialPassword(newPassword: string) {
  await getAuth().api.setPassword({ body: { newPassword }, headers: await headers() });
}
