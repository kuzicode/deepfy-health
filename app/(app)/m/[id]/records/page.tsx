import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { computeFlag, effectiveRange, measureOnly, otherAbnormalCount, summarize } from "@/core/analysis";
import { PageHead } from "@/ui/blocks";
import { Flag } from "@/ui/Flag";
import { rangeText, valClass } from "@/ui/format";
import { indicatorName, recordTitle } from "@/ui/i18n";
import { Markdown } from "@/ui/Markdown";
import { cloudMode } from "@/db/client";
import { LogList } from "@/ui/LogList";
import { memberOrNotFound } from "@/ui/repo";
import { OtherItems } from "@/ui/OtherItems";
import { catalogFeedbackAction, deleteLogAction } from "../actions";
import { OpenFromHash } from "@/ui/OpenFromHash";
import { recAnchor } from "@/ui/rec-anchor";

export default async function RecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member: m, catalog } = await memberOrNotFound(id);
  const t = await getTranslations("app");
  const locale = await getLocale();
  const records = [...m.records].sort((a, b) => b.date.localeCompare(a.date));
  const years = [...new Set(records.map((r) => r.date.slice(0, 4)))];
  const canFeedback = cloudMode();

  return (
    <>
      <OpenFromHash />
      <PageHead eyebrow={t("records.eyebrow")} title={t("records.title")} sub={`${m.name} · ${t("records.count", { count: records.length })}`} />
      {m.logs.length > 0 && (
        <section className="a-section" style={{ marginTop: 0 }}>
          <h2 className="a-subhead">{t("quick.logsTitle")}</h2>
          <LogList member={id} logs={m.logs} deleteAction={cloudMode() ? deleteLogAction.bind(null, id) : undefined} />
        </section>
      )}
      {records.length === 0 && <div className="a-panel a-empty">{t("records.empty")}</div>}
      <div className="a-timeline">
        {years.map((y) => (
          <div key={y}>
            <div className="a-year">{y}</div>
            {records.filter((r) => r.date.startsWith(y)).map((rec) => {
              const rows = rec.indicators.map((r) => {
                const entry = catalog.get(r.code);
                const range = effectiveRange(r, entry, m.profile?.sex);
                // 身高体重这类纯测量项没有高低之分：不显示「未判定」
                const flag = computeFlag(r, range, entry);
                return { r, entry, range, flag: measureOnly({ code: r.code, range, flag }, catalog) ? undefined : flag };
              });
              const base = summarize(rows.filter((x) => x.flag !== undefined).map((x) => x.flag ?? null));
              const sum = { ...base, abnormal: base.abnormal + otherAbnormalCount(rec) }; // 其他项目里的异常也算上
              return (
                <details key={rec.slug} id={recAnchor(rec.slug)} className="a-panel a-rec reveal" open={rec === records[0]}>
                  <summary>
                    <span className="date">{rec.date.slice(5)}</span>
                    <span className="t"><b>{recordTitle(t, rec)}</b><span>{t(`recordType.${rec.type}`)}{rec.institution && ` · ${rec.institution}`} · {t("records.items", { count: rows.length + (rec.other_items?.length ?? 0) })}</span></span>
                    {sum.abnormal > 0 ? <span className="chip chip-H">{t("records.abnormal", { count: sum.abnormal })}</span>
                      : sum.unknown > 0 ? <span className="chip chip-unknown">{t("records.unknownCount", { count: sum.unknown })}</span>
                      : sum.normal > 0 && <span className="chip chip-N">{t("records.allNormal")}</span>}
                  </summary>
                  <div className="body">
                    <Markdown source={rec.body} />
                    <div className="a-rows">
                      {rows.map(({ r, entry, range, flag }) => {
                        const rt = rangeText(range, r.ref_text);
                        return (
                          <Link key={r.code} href={`/m/${id}/indicators/${r.code}`} className="a-row">
                            <span className="main"><span className="title">{indicatorName(entry, r.name ?? r.code, locale)}</span>{rt !== "—" && <span className="detail" style={{ display: "block" }}>{t("member.ref", { range: rt })}</span>}</span>
                            <span className="right"><span className={valClass(r.value)}>{r.value}<small>{r.unit ?? entry?.unit}</small></span>{flag !== undefined && <Flag flag={flag} showNormal={false} />}</span>
                            <ChevronRight size={16} className="chev" />
                          </Link>
                        );
                      })}
                    </div>
                    <OtherItems items={rec.other_items} feedback={canFeedback ? catalogFeedbackAction.bind(null, id, rec.slug) : undefined} />
                  </div>
                </details>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
