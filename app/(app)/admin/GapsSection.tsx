import { getTranslations } from "next-intl/server";
import type { catalogFeedback } from "@/db/schema";
import { SectionHead } from "@/ui/blocks";

/** 字典缺口反馈：只有聚合后的项目名称、单位、分组与次数（不含数值、不关联账号） */
export async function GapsSection({ gaps }: { gaps: (typeof catalogFeedback.$inferSelect)[] }) {
  const t = await getTranslations("admin");
  return (
    <section className="a-section">
      <SectionHead title={t("gaps.title")} />
      <p className="muted" style={{ margin: "-6px 0 12px", fontSize: 13.5 }}>{t("gaps.hint")}</p>
      <div className="a-panel a-rows">
        {gaps.map((g) => (
          <div className="a-row" key={g.nameNorm}>
            <span className="main"><span className="title">{g.name}</span><span className="detail" style={{ display: "block" }}>{[g.section, g.unit, t("gaps.last", { date: g.lastSeen.toISOString().slice(0, 7) })].filter(Boolean).join(" · ")}</span></span>
            <span className="chip chip-mint">{t("gaps.count", { count: g.count })}</span>
          </div>
        ))}
        {gaps.length === 0 && <div className="a-empty">{t("gaps.empty")}</div>}
      </div>
    </section>
  );
}
