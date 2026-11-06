import { getLocale, getTranslations } from "next-intl/server";
import type { ConditionFocus } from "@/core/health-template";
import type { Catalog } from "@/core/schema";
import { CopyButton } from "./CopyButton";
import { indicatorName } from "./i18n";

// 已知状况（档案 conditions）：放在「需要关注」最上面，一眼看到——相关检查是否查过、有没有调养方案；
// 没有方案时给一段可复制的分析请求，交给用户自己的 agent（网页不内嵌 AI）
export async function ConditionPanel({ member, name, conditions, allergies, catalog }: {
  member: string; name: string; conditions: ConditionFocus[]; allergies: string[]; catalog: Catalog;
}) {
  if (!conditions.length) return null;
  const active = conditions.filter((c) => !c.resolved);
  const past = conditions.filter((c) => c.resolved);
  const t = await getTranslations("app");
  const locale = await getLocale();
  const item = (id: string) => t(`template.items.${id}.name` as "template.items.bp.name");
  const codeNames = (codes: string[]) => codes.map((c) => indicatorName(catalog.get(c), c, locale)).join("、");

  return (
    <div className="a-conds">
      {active.map((c) => (
        <div key={c.name} className="a-cond">
          <div className="top">
            <span className="tag">{t("member.conditionsTag")}</span>
            <h3>{c.name}</h3>
            {c.abnormal.length > 0 && <span className="chip chip-warn">{t("member.conditionAbnormal", { codes: codeNames(c.abnormal) })}</span>}
            {c.nextRecheck && <span className="recheck">{t("member.conditionRecheck", { date: c.nextRecheck })}</span>}
          </div>
          <div className="checks">
            <span className="label">{t("member.conditionChecks")}</span>
            {c.checks.length ? c.checks.map((x) => (
              <span key={x.id} className={`chip ${x.status === "covered" ? "chip-mint" : "chip-warn"}`}>
                {item(x.id)} · {t(`template.status.${x.status}`)}{x.last ? ` ${x.last}` : ""}
              </span>
            )) : <span className="muted">{t("member.conditionNoChecks")}</span>}
          </div>
          <div className="plan">
            {c.hasPlan ? (
              <><span className="ok">● {t("member.conditionPlan")}</span><a href="#care-plan">{t("member.conditionViewPlan")}</a></>
            ) : (
              <>
                <span className="muted">{t("member.conditionNoPlan")}</span>
                <CopyButton primary label={t("member.conditionAsk")} copied={t("member.conditionAskCopied")}
                  text={t("member.conditionPrompt", { name, id: member, condition: c.name, codes: c.codes.join(", ") || t("member.conditionCodesAny") })} />
              </>
            )}
          </div>
        </div>
      ))}
      {/* 已愈 / 既往：默认收起，只留一行 */}
      {past.length > 0 && (
        <details className="a-cond-past">
          <summary>{t("member.pastConditions", { count: past.length })}</summary>
          <ul>{past.map((c) => <li key={c.name}>{c.name}</li>)}</ul>
        </details>
      )}
      {allergies.length > 0 && <p className="muted a-cond-foot">{t("member.allergies", { list: allergies.join("、") })}</p>}
    </div>
  );
}
