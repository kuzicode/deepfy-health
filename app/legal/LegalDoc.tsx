import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LocaleToggle } from "@/ui/LocaleToggle";

export async function LegalDoc({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  const t = await getTranslations("legal");
  return (
    <main className="legal">
      <div className="legal-top"><a href="/login" className="a-back"><ChevronLeft size={14} />{t("back")}</a><LocaleToggle /></div>
      <h1>{title}</h1>
      <p className="legal-updated">{t("updated", { date: updated })}</p>
      <article className="prose">{children}</article>
    </main>
  );
}
