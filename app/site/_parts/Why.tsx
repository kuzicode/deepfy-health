import { Check, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SiteSectionHead } from "./SectionHead";

// 首页「为什么用 Deepfy」：直接用 agent vs 接入 Deepfy 的 agent，逐项对比，回答「我为什么要用这个」。

const ROWS = ["memory", "input", "knowledge", "always", "remind", "control"] as const;

export async function Why() {
  const t = await getTranslations("site.why");
  return (
    <section className="s-section" id="why">
      <SiteSectionHead eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
      <div className="why reveal" role="table" aria-label={t("title")}>
        <div className="why-row why-head" role="row">
          <span role="columnheader" />
          <span role="columnheader" className="why-no">{t("without")}</span>
          <span role="columnheader" className="why-yes">{t("with")}</span>
        </div>
        {ROWS.map((k) => (
          <div className="why-row" role="row" key={k}>
            <b role="rowheader">{t(`rows.${k}.k`)}</b>
            <span role="cell" className="why-no"><X size={15} aria-hidden="true" />{t(`rows.${k}.no`)}</span>
            <span role="cell" className="why-yes"><Check size={15} aria-hidden="true" />{t(`rows.${k}.yes`)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
