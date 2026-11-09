import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { registrationRestricted } from "@/server/access";
import { googleEnabled } from "@/server/edition";
import { getSession } from "@/server/session";
import { siteUrl } from "@/site-links";
import { Wordmark } from "@/ui/Logo";
import { LocaleToggle } from "@/ui/LocaleToggle";
import { ClearSignedInMark } from "@/client/signed-in-mark";
import { LoginView } from "./LoginView";
import "./login.css";

export async function generateMetadata() {
  const t = await getTranslations("login");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; mode?: string }> }) {
  if (await getSession()) redirect("/");
  const { error, mode } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("login");
  const support = process.env.KZ_SUPPORT_EMAIL;
  const site = siteUrl(locale);

  return (
    <main className="login" lang={locale}>
      <ClearSignedInMark />
      <header className="login-top">
        <a href={site} aria-label={t("backToSite")}><Wordmark /></a>
        <div className="login-top-right">
          <a className="login-back" href={site}><ArrowLeft size={15} aria-hidden="true" />{t("backToSite")}</a>
          <LocaleToggle />
        </div>
      </header>
      <LoginView error={error} legal={{ terms: "/legal/terms", privacy: "/legal/privacy" }} canApply={registrationRestricted()} initialMode={mode} selfHostHref={`${site}/docs#self-host`} google={googleEnabled()} />
      <footer className="login-foot">
        <a href="/legal/terms">{t("terms")}</a><span>|</span><a href="/legal/privacy">{t("privacy")}</a>
        {support && <><span>|</span><a href={`mailto:${support}`}>{t("contact")}</a></>}
      </footer>
    </main>
  );
}
