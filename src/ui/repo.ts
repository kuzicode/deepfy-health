import { notFound } from "next/navigation";
import type { HealthReader } from "@/core/bundle";
import { defaultRepository } from "@/core/vault";
import { cloudMode } from "@/db/client";
import { userRepository } from "@/server/session";

// 云端模式（设置了 DATABASE_URL）：当前登录用户的加密数据；否则读本地 vault（开发用）
export async function getReader(): Promise<HealthReader> {
  if (cloudMode()) return userRepository();
  if (process.env.NODE_ENV === "production" && process.env.KZ_ALLOW_LOCAL_VAULT !== "1") {
    throw new Error("生产环境必须配置 DATABASE_URL");
  }
  return defaultRepository();
}

export async function memberOrNotFound(id: string) {
  const found = await (await getReader()).getMember(id);
  if (!found) notFound();
  return found;
}
