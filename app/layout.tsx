import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "@fontsource-variable/inter";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/noto-serif-sc/500.css";
import "./styles/tokens.css";
import "./styles/base.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    metadataBase: new URL(process.env.KZ_APP_URL || "http://localhost:3000"),
    title: { default: t("title"), template: `%s · Deepfy` },
    description: t("description"),
    openGraph: { siteName: "Deepfy", title: t("title"), description: t("description") },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body>
        <div className="backdrop" aria-hidden="true"><div className="aurora" /></div>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
