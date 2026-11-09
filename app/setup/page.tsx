import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { isSelfHosted } from "@/server/edition";
import { isLocalHost, setupDone } from "@/server/setup";
import { Wordmark } from "@/ui/Logo";
import { LocaleToggle } from "@/ui/LocaleToggle";
import { SetupForm } from "./SetupForm";
import "../login/login.css";

export async function generateMetadata() {
  const t = await getTranslations("setup");
  return { title: t("title") };
}

/** 自托管版首次设置：一个账号都没有时创建所有者（管理员）；之后访问一律回登录页 */
export default async function SetupPage() {
  if (!isSelfHosted()) notFound();
  if (await setupDone(getDb())) redirect("/login");
  const t = await getTranslations("setup");
  const local = isLocalHost((await headers()).get("host"));
  return (
    <main className="login" lang={await getLocale()}>
      <header className="login-top">
        <Wordmark />
        <div className="login-top-right"><LocaleToggle /></div>
      </header>
      <div className="l-card">
        <h1>{t("title")}</h1>
        <p className="l-sub">{t("sub")}</p>
        {local ? <SetupForm /> : <p className="l-msg err" role="alert">{t("localOnly")}</p>}
      </div>
      <footer className="login-foot" />
    </main>
  );
}
