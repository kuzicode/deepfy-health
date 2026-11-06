import { getLocale, getTranslations } from "next-intl/server";
import type { CheckupPlan, PlanItem } from "@/core/health-template";
import type { Catalog } from "@/core/schema";
import { indicatorName } from "./i18n";

// 健康模板提示：一行覆盖率 + 前 5 个建议加查（悬停看理由），其余收在 details 里——只是提示，不抢主内容
export async function CheckupHints({ plan, catalog }: { plan: CheckupPlan; catalog: Catalog }) {
  const t = await getTranslations("app");
  const locale = await getLocale();
  const name = (id: string) => t(`template.items.${id}.name` as "template.items.bp.name");
  const why = (x: PlanItem) => {
    const rel = x.related.map((r) => {
      const [kind, v] = r.split(":");
      if (kind === "abnormal") return t("template.relAbnormal", { name: indicatorName(catalog.get(v), v, locale) });
      return kind === "condition" ? t("template.relCondition", { kw: v }) : t("template.relSymptom", { kw: v });
    });
    return [...rel, t(`template.items.${x.id}.why` as "template.items.bp.why")].join(" · ");
  };
  const top = plan.suggestions.slice(0, 5);

  return (
    <div className="a-hints">
      <div className="head">
        <span className="cov">{t("template.coverage", { covered: plan.covered, total: plan.total })}</span>
        {top.length ? (
          <>
            <span className="label">{t("template.suggest")}</span>
            {top.map((x) => (
              <span key={x.id} className={`chip ${x.related.length ? "chip-warn" : "chip-mint"}`} title={why(x)}>{name(x.id)}</span>
            ))}
          </>
        ) : <span className="label">{t("template.none")}</span>}
      </div>
      <details>
        <summary>{t("template.more")}</summary>
        <ul>
          {plan.items.map((x) => (
            <li key={x.id}>
              <span className={`dot ${x.status}`} />
              <b>{name(x.id)}</b>
              <span className="st">{t(`template.status.${x.status}`)}{x.last && ` · ${t("template.last", { date: x.last })}`}</span>
              <span className="why">{why(x)}</span>
            </li>
          ))}
        </ul>
        <p className="disc">{t("template.disclaimer")}</p>
      </details>
    </div>
  );
}
