import { getTranslations } from "next-intl/server";
import { SiteSectionHead } from "./SectionHead";

// 首页「问问你的 Agent」：6 个对话场景，让访客一眼看出能拿 Deepfy 做什么。
// 示例数据用官网虚构的一家人（林夏 / 妈妈 / 爸爸，见 _belt/content.ts），不用任何真实用户的数据。

const SCENES = ["diet", "trip", "family", "doctor", "log", "report"] as const;

export async function Scenes() {
  const t = await getTranslations("site.scenes");
  return (
    <section className="s-section" id="scenes">
      <SiteSectionHead eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
      <div className="scenes">
        {SCENES.map((k, i) => (
          <article className="scene spotlight reveal" key={k} style={{ transitionDelay: `${(i % 3) * 0.06}s` }}>
            <span className="scene-tag">{t(`items.${k}.tag`)}</span>
            <p className="scene-q" aria-label={t("you")}>{t(`items.${k}.q`)}</p>
            <p className="scene-a">{t.rich(`items.${k}.a`, { b: (c) => <b>{c}</b> })}</p>
            <p className="scene-r"><span>{t("reads")}</span>{t(`items.${k}.r`)}</p>
          </article>
        ))}
      </div>
      <p className="scenes-note">{t("note")}</p>
    </section>
  );
}
