import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cloudMode, getDb } from "@/db/client";
import { isAdmin, isDisabled } from "./access";
import { getAuth } from "./auth";
import { masterKey } from "./crypto";
import { PgRepository } from "./pg-repository";

export async function getSession() {
  if (!cloudMode()) return null;
  return getAuth().api.getSession({ headers: await headers() });
}

/** 已登录用户；未登录跳转 /login */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (await isDisabled(getDb(), session.user.id)) redirect("/login?error=disabled");
  return session.user;
}

/** 管理员页面：非管理员一律 404，不暴露后台的存在 */
export async function requireAdmin() {
  const u = await requireUser();
  if (!(await isAdmin(getDb(), u))) notFound();
  return u;
}

export async function userRepository() {
  const u = await requireUser();
  return new PgRepository(getDb(), u.id, masterKey());
}
