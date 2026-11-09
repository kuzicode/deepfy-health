"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAuth } from "@/server/auth";
import { isSelfHosted } from "@/server/edition";
import { isLocalHost } from "@/server/setup";

type SetupError = "localOnly" | "mismatch" | "invalid" | "user_exists" | "generic";
export type SetupState = { error?: SetupError };
type Account = { name: string; email: string; password: string };

function readForm(form: FormData): Account | SetupError {
  const [name, email, password, confirm] = ["name", "email", "password", "confirm"].map((k) => String(form.get(k) ?? ""));
  if (password !== confirm) return "mismatch";
  if (!name.trim() || !email.trim() || password.length < 8 || password.length > 128) return "invalid";
  return { name, email, password };
}

/** 建所有者；已经有人设置过返回 "done" */
async function createOwner(body: Account): Promise<SetupError | "done" | undefined> {
  try {
    await getAuth().api.kzSetupOwner({ body });
  } catch (e) {
    const err = e as { body?: { code?: string }; statusCode?: number };
    if (err.body?.code === "setup_done") return "done";
    if (err.body?.code === "user_exists") return "user_exists";
    console.error("setup failed:", e instanceof Error ? e.message : "unknown"); // 比如主密钥配错，运行的人要在日志里看得到原因
    return err.statusCode === 400 ? "invalid" : "generic";
  }
}

/** 首次设置：创建所有者并直接登录。真正的「只能设置一次」由 kzSetupOwner 保证，这里只做表单校验 */
export async function setupOwner(_prev: SetupState, form: FormData): Promise<SetupState> {
  if (!isSelfHosted()) notFound();
  const h = await headers();
  if (!isLocalHost(h.get("host"))) return { error: "localOnly" };
  const account = readForm(form);
  if (typeof account === "string") return { error: account };
  const result = await createOwner(account);
  if (result === "done") redirect("/login");
  if (result) return { error: result };
  await getAuth().api.signInEmail({ body: { email: account.email, password: account.password }, headers: h });
  redirect("/");
}
