import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { isAbnormal, latestReadings } from "@/core/analysis";
import { PageHead } from "@/ui/blocks";
import { categoryColor, sortCategories } from "@/ui/categories";
import { Flag } from "@/ui/Flag";
import { rangeText, valClass } from "@/ui/format";
import { categoryLabel, indicatorName } from "@/ui/i18n";
import { memberOrNotFound } from "@/ui/repo";

export default async function BrowsePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cat?: string }> }) {
  const { id } = await params;
  const { cat } = await searchParams;
  const { member: m, catalog } = await memberOrNotFound(id);
  const t = await getTranslations("app");
  const locale = await getLocale();
  const latest = latestReadings(m, catalog);
  const cats = sortCategories(latest.map((r) => r.category));
  const shown = cat && cats.includes(cat) ? [cat] : cats;
  const label = (c: string) => categoryLabel(t, t.has, c);

  return (
    <>
      <PageHead eyebrow={t("browse.eyebrow")} title={cat && cats.includes(cat) ? label(cat) : t("browse.title")} sub={`${m.name} · ${t("browse.latest")}`} />
      <div className="a-seg">
        <Link href={`/m/${id}/browse`} className={!cat ? "on" : ""}>{t("browse.all")}</Link>
        {cats.map((c) => {
          const n = latest.filter((r) => r.category === c && isAbnormal(r.flag)).length;
          return <Link key={c} href={`/m/${id}/browse?cat=${encodeURIComponent(c)}`} className={c === cat ? "on" : ""}>{label(c)}{n > 0 && <span className="n">{n}</span>}</Link>;
        })}
      </div>
      {latest.length === 0 && <div className="a-panel a-empty">{t("browse.empty")}</div>}
      <div className="a-masonry">
        {shown.map((c) => (
          <div key={c} className="a-panel">
            <div className="a-cat-head"><span className="sw" style={{ background: categoryColor(c) }} />{label(c)}</div>
            <div className="a-rows">
              {latest.filter((r) => r.category === c).map((r) => {
                const range = rangeText(r.range);
                return (
                  <Link key={r.code} href={`/m/${id}/indicators/${r.code}`} className="a-row">
                    <span className="main">
                      <span className="title">{indicatorName(catalog.get(r.code), r.name, locale)}</span>
                      <span className="detail" style={{ display: "block" }}>{[range !== "—" ? t("member.ref", { range }) : null, r.date].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="right"><span className={valClass(r.value)}>{r.value}<small>{r.unit}</small></span><Flag flag={r.flag} showNormal={false} /></span>
                    <ChevronRight size={16} className="chev" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
