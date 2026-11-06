import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { LatestReading, Reminder } from "@/core/analysis";
import type { Catalog } from "@/core/schema";
import { categoryColor } from "./categories";
import { Flag } from "./Flag";
import { deltaText, rangeText } from "./format";
import { categoryLabel, indicatorName, reminderHref, reminderText } from "./i18n";

export function PageHead({ eyebrow, title, sub, back, right }: { eyebrow: string; title: React.ReactNode; sub?: React.ReactNode; back?: { href: string; label: string }; right?: React.ReactNode }) {
  return (
    <div className="a-head">
      <div>
        {back ? <Link href={back.href} className="a-back"><ChevronLeft size={14} />{back.label}</Link> : <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function SectionHead({ title, action }: { title: string; action?: { href: string; label: string } }) {
  return (
    <div className="a-section-head">
      <h2>{title}</h2>
      {action && <Link href={action.href}>{action.label} →</Link>}
    </div>
  );
}

export function ReminderRows({ items, names }: { items: Reminder[]; names?: Map<string, string> }) {
  const t = useTranslations("app");
  return (
    <div className="a-panel a-rows">
      {items.map((r) => (
        <Link key={`${r.memberId}-${r.kind}-${r.due}-${r.code ?? ""}`} href={reminderHref(r)} className="a-row">
          <span className="kind">{t(`reminder.kind.${r.kind}`)}</span>
          <span className="dot" style={{ background: r.overdue ? "var(--high)" : "var(--warn)" }} />
          <span className="main">
            <span className="title">{names && <b>{names.get(r.memberId)} · </b>}{reminderText(t, r)}</span>
          </span>
          <span className={`when${r.overdue ? " over" : ""}`}>{t(r.overdue ? "reminder.overdue" : "reminder.due", { date: r.due })}</span>
          <ChevronRight size={16} className="chev" />
        </Link>
      ))}
    </div>
  );
}

/** 概览「需要关注」的紧凑卡片：两行——名称 + 数值；状态 · 参考 · 较上次 · 日期。不画趋势（点进去看） */
/** 概览「需要关注」的紧凑卡片：固定三行（名称 + 数值 / 状态 · 参考或结论 · 较上次 · 日期 / 分析摘要），同一网格里等高对齐 */
export function IndicatorTile({ r, catalog, note, href }: { r: LatestReading; catalog: Catalog; note?: string; href: string }) {
  const t = useTranslations("app");
  const locale = useLocale();
  const range = rangeText(r.range);
  const isText = typeof r.value === "string";
  const delta = deltaText(r.value, r.previous);
  return (
    <Link href={href} className="a-panel a-tile compact spotlight">
      <div className="row1">
        <span className="name" title={categoryLabel(t, t.has, r.category)}>
          <span className="dot" style={{ background: categoryColor(r.category) }} />
          <span className="ellipsis">{indicatorName(catalog.get(r.code), r.name, locale)}</span>
        </span>
        {!isText && <span className="val">{r.value}<small>{r.unit}</small></span>}
      </div>
      <div className="meta">
        <Flag flag={r.flag} />
        {isText
          ? <span className="ellipsis concl" title={String(r.value)}>{r.value}</span>
          : <span className="ellipsis">{range !== "—" ? t("member.ref", { range }) : t("member.noRange")}</span>}
        {delta && <span className="delta">{t("member.vsPrevious")} {delta}</span>}
        <span className="date">{r.date.slice(5)}</span>
      </div>
      <p className="note ellipsis">{note ?? "\u00a0"}</p>
    </Link>
  );
}
