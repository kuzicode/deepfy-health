import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { computeFlag, effectiveRange, type LatestReading, latestReadings, regimenSpans, type RegimenSpan, series, type SeriesPoint } from "@/core/analysis";
import { PageHead, SectionHead } from "@/ui/blocks";
import { categoryColor } from "@/ui/categories";
import { Flag } from "@/ui/Flag";
import { deltaText, rangeText, valClass } from "@/ui/format";
import { categoryLabel, indicatorName, recordTitle } from "@/ui/i18n";
import { Markdown } from "@/ui/Markdown";
import { memberOrNotFound } from "@/ui/repo";
import { TrendChart } from "@/ui/TrendChart";

/** 文字结论（心电图、超声…）用中号文字，数值用大号数字 */
const bigClass = (v: number | string) => (typeof v === "string" ? "big text" : "big");

/** 参考范围说明：文字结论没有范围，不显示 */
function RefLabel({ value, range, unit, refText, noneText }: { value: number | string; range: string; unit: string; refText: string; noneText: string }) {
  if (typeof value !== "number") return null;
  return <span>{range !== "—" ? `${refText} ${range} ${unit}` : noneText}</span>;
}

/** 最新结果 + 较上次 + 小趋势图（只有一次记录时写明「首次记录」，文字结论不画图） */
async function LatestCard({ latest, points, spans }: { latest: LatestReading; points: SeriesPoint[]; spans: RegimenSpan[] }) {
  const t = await getTranslations("app");
  const range = rangeText(latest.range);
  // 「较上次」：同单位序列里的倒数第二个点（单位不同的历史不可比，series 已排除）
  const prev = typeof latest.value === "number" ? points.at(-2) : undefined;
  const legend = spans.length > 0 && (
    <div className="chart-marks">
      {spans.map((s) => <span key={`${s.name}-${s.start}`}>{s.end ? t("regimen.trendRange", { name: s.name, start: s.start, end: s.end }) : t("regimen.trendStart", { name: s.name, date: s.start })}</span>)}
      <span>{t("regimen.trendLegend")}</span>
    </div>
  );
  const labels = { value: t("indicator.value"), range: t("indicator.refRange"), flags: { H: t("flag.H"), L: t("flag.L"), A: t("flag.A"), N: t("flag.N") } };
  return (
    <div className={`a-panel a-hero${typeof latest.value === "number" ? " split" : ""}`}>
      <div>
        <div className="eyebrow" style={{ color: "var(--muted)" }}>{t("indicator.latest")} · {latest.date}</div>
        <div className={bigClass(latest.value)}>{latest.value}<small>{latest.unit}</small></div>
        <div className="meta">
          <Flag flag={latest.flag} />
          <RefLabel value={latest.value} range={range} unit={latest.unit} refText={t("indicator.refRange")} noneText={t("member.noRange")} />
        </div>
        {prev && <div className="vs">{t("indicator.vsPrevious", { date: prev.date })} <span className="mono">{prev.value} → {latest.value}</span> <b>{deltaText(latest.value, prev.value)}</b></div>}
      </div>
      {typeof latest.value === "number" && (points.length > 1 ? (
        <div className="mini-trend"><TrendChart compact height={150} points={points} unit={latest.unit} labels={labels} spans={spans} /></div>
      ) : (
        <p className="muted first">{t("indicator.firstReading")}</p>
      ))}
      {legend}
    </div>
  );
}

export default async function IndicatorPage({ params }: { params: Promise<{ id: string; code: string }> }) {
  const { id, code } = await params;
  const { member: m, catalog } = await memberOrNotFound(id);
  const latest = latestReadings(m, catalog).find((r) => r.code === code);
  if (!latest) notFound();
  const t = await getTranslations("app");
  const locale = await getLocale();
  const entry = catalog.get(code);
  const points = series(m, catalog, code);
  const note = m.notes.get(code);
  const readings = m.records
    .flatMap((rec) => rec.indicators.filter((r) => r.code === code).map((r) => ({ rec, r })))
    .sort((a, b) => b.rec.date.localeCompare(a.rec.date));

  return (
    <>
      <PageHead eyebrow="" back={{ href: `/m/${id}/browse`, label: t("nav.indicators") }} title={indicatorName(entry, latest.name, locale)}
        sub={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span className="dot" style={{ background: categoryColor(latest.category) }} />{categoryLabel(t, t.has, latest.category)} · <span className="mono">{code}</span></span>} />

      {/* 没有分析摘要时最新结果占满整行，小趋势图更宽 */}
      <div className={note ? "a-two" : undefined}>
        <LatestCard latest={latest} points={points} spans={regimenSpans(m, code)} />
        {note && (
          <div className={`a-panel a-note-card`}>
            <span className={`chip ${note.status === "attention" ? "chip-H" : note.status === "watch" ? "chip-warn" : "chip-N"}`}>{t(`status.${note.status}`)}</span>
            <p className="sum">{note.summary}</p>
            {note.recheck && <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>{t("indicator.recheck", { date: note.recheck })}</p>}
          </div>
        )}
      </div>

      <div className="a-two a-section">
        <div>
          <SectionHead title={t("indicator.analysis")} />
          <div className="a-panel a-pad">{note ? <><Markdown source={note.body} /><p className="muted" style={{ fontSize: 12, marginTop: 16 }}>{t("member.updated", { date: note.updated })}</p></> : <span className="muted">{t("indicator.noNote")}</span>}</div>
        </div>
        <div>
          <SectionHead title={t("indicator.history")} />
          <div className="a-panel a-rows">
            {readings.map(({ rec, r }) => (
              <div key={rec.slug} className="a-row">
                <span className="main"><span className="title mono" style={{ fontSize: 13.5 }}>{rec.date}</span><span className="detail" style={{ display: "block" }}>{recordTitle(t, rec)}</span></span>
                <span className="right"><span className={valClass(r.value)}>{r.value}<small>{r.unit ?? entry?.unit}</small></span><Flag flag={computeFlag(r, effectiveRange(r, entry, m.profile?.sex), entry)} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
