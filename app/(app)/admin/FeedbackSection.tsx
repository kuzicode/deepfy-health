import { getTranslations } from "next-intl/server";
import type { feedback } from "@/db/schema";
import { cnDateTime } from "@/server/cn-time";
import { SectionHead } from "@/ui/blocks";


/** 用户反馈：最近 50 条；未进入每周汇总的标出来 */
export async function FeedbackSection({ items }: { items: (typeof feedback.$inferSelect)[] }) {
  const t = await getTranslations("admin.feedback");
  return (
    <section className="a-section">
      <SectionHead title={t("title")} />
      <p className="muted" style={{ margin: "-6px 0 12px", fontSize: 13.5 }}>{t("hint")}</p>
      <div className="a-panel a-rows">
        {items.map((f) => (
          <div className="a-row" key={f.id} style={{ alignItems: "flex-start" }}>
            <span className="main">
              <span className="detail" style={{ display: "block", marginBottom: 4 }}>{[t(`kinds.${f.kind}` as "kinds.idea"), f.email, cnDateTime(f.createdAt), f.page].filter(Boolean).join(" · ")}</span>
              <span className="title" style={{ whiteSpace: "pre-wrap", fontWeight: 400 }}>{f.body}</span>
            </span>
            {!f.digestedAt && <span className="chip chip-warn">{t("pending")}</span>}
          </div>
        ))}
        {items.length === 0 && <div className="a-empty">{t("empty")}</div>}
      </div>
    </section>
  );
}
