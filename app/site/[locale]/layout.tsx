import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isLocale, LOCALES } from "@/i18n/config";
import { appUrl, siteBase, SOCIAL } from "@/site-links";
import { Interactions } from "@/ui/Interactions";
import { Wordmark } from "@/ui/Logo";
import { SiteAccount } from "../_parts/SiteAccount";
import "../site.css";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations("site.nav");
  const c = await getTranslations("common");
  const f = await getTranslations("site.foot");
  const nav = await getTranslations("app.nav");
  const base = await siteBase();
  const home = `${base}/${locale}`;

  return (
    <div className="s-root" lang={locale}>
      <Interactions />
      <div className="s-nav-wrap">
        <nav className="s-nav glass">
          <a href={home} aria-label="Deepfy"><Wordmark /></a>
          <div className="s-links">
            <a href={`${home}#why`}>{t("why")}</a>
            <a href={`${home}#agents`}>{t("agents")}</a>
            <a href={`${home}#scenes`}>{t("scenes")}</a>
            <a href={`${home}#security`}>{t("security")}</a>
            <a href={`${home}/docs`}>{t("docs")}</a>
          </div>
          <div className="s-right">
            <span className="locale-switch">
              <a href={`${base}/zh`} className={locale === "zh" ? "on" : ""} hrefLang="zh">中</a>
              <a href={`${base}/en`} className={locale === "en" ? "on" : ""} hrefLang="en">EN</a>
            </span>
            <a className="s-nav-docs" href={`${home}/docs`}>{t("docs")}</a>
            <SiteAccount appBase={appUrl("")} labels={{ login: c("login"), enter: c("enterApp"), account: c("account"), settings: nav("settings"), reminders: nav("reminders"), feedback: nav("feedback"), signOut: nav("signOut") }} />
          </div>
        </nav>
      </div>
      {children}
      <footer className="s-foot">
        <div className="s-foot-top">
          <div className="s-foot-brand">
            <Wordmark size={20} />
            <p>{f("tagline")}</p>
          </div>
          <a className="s-foot-gh" href={SOCIAL.github} target="_blank" rel="noopener" aria-label="GitHub">
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
          </a>
        </div>
        <div className="s-foot-bottom">
          <span>{f("rights")} · <a href={SOCIAL.author.href} target="_blank" rel="noopener">{SOCIAL.author.label}</a> · {c("disclaimer")}</span>
          <nav aria-label={f("label")}>
            <a href={SOCIAL.releases} target="_blank" rel="noopener">{f("releases")}</a>
            <a href={appUrl("/feedback")}>{f("feedback")}</a>
            <a href={appUrl("/legal/terms")}>{c("terms")}</a>
            <a href={appUrl("/legal/privacy")}>{c("privacy")}</a>
            {/* 手机上顶部隐藏了语言切换，页脚留一个入口；桌面不显示（导航里已有） */}
            <a className="s-foot-locale" href={`${base}/${locale === "zh" ? "en" : "zh"}`} hrefLang={locale === "zh" ? "en" : "zh"}>{locale === "zh" ? "English" : "中文"}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
