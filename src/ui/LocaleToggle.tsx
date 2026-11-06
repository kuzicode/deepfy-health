"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";

export function LocaleToggle() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (l: "zh" | "en") => start(async () => { await setLocale(l); router.refresh(); });
  return (
    <span className="locale-switch" aria-busy={pending}>
      <button type="button" className={locale === "zh" ? "on" : ""} onClick={() => pick("zh")}>中</button>
      <button type="button" className={locale === "en" ? "on" : ""} onClick={() => pick("en")}>EN</button>
    </span>
  );
}
