import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { registrationRestricted } from "@/server/access";
import { getSession } from "@/server/session";
import { Wordmark } from "@/ui/Logo";
import { LocaleToggle } from "@/ui/LocaleToggle";
import { ClearSignedInMark } from "@/client/signed-in-mark";
import { LoginView } from "./LoginView";
import "./login.css";

export async function generateMetadata() {
  const t = await getTranslations("login");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect("/");
  const { error } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("login");
  const support = process.env.KZ_SUPPORT_EMAIL;

  return (
    <main className="login" lang={locale}>
      <ClearSignedInMark />
      <header className="login-top"><Wordmark /><LocaleToggle /></header>
      <LoginView error={error} legal={{ terms: "/legal/terms", privacy: "/legal/privacy" }} canApply={registrationRestricted()} />
      <footer className="login-foot">
        <a href="/legal/terms">{t("terms")}</a><span>|</span><a href="/legal/privacy">{t("privacy")}</a>
        {support && <><span>|</span><a href={`mailto:${support}`}>{t("contact")}</a></>}
      </footer>
    </main>
  );
}
