import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { daysBetween, type ScheduleItem } from "@/core/analysis";
import type { Catalog } from "@/core/schema";
import { ScheduleActions } from "./forms/ScheduleActions";
import { indicatorName, reminderHref, reminderText } from "./i18n";

const SHOWN = 3;

// 「接下来」：成员的全部待办（复查 / 体检 / 用药结束），放在「需要关注」上面。
// 数据来自 schedule()——提醒、邮件、agent 定时任务共用同一个来源，网页上不会出现两套日期。
export async function Schedule({ items, today, catalog, action }: { items: ScheduleItem[]; today: string; catalog: Catalog; action?: React.ComponentProps<typeof ScheduleActions>["action"] }) {
  const t = await getTranslations("app");
  const locale = await getLocale();
  if (!items.length) return <div className="a-panel a-empty">{t("member.scheduleEmpty")}</div>;

  const title = (x: ScheduleItem) => {
    if (x.kind === "recheck") return t("reminder.recheckMany", { names: x.codes.map((c) => indicatorName(catalog.get(c), c, locale)).join("、") });
    // 还早的年度体检不说「该安排了」，只说下次在什么时候
    if (x.kind === "annual-checkup" && !x.soon && x.params.last) return t("reminder.annualNext", { last: String(x.params.last) });
    return reminderText(t, x);
  };
  const when = (x: ScheduleItem) => {
    const d = daysBetween(today, x.due);
    if (d < 0) return t("member.daysOver", { days: -d });
    return d === 0 ? t("member.today") : t("member.daysLeft", { days: d });
  };
  // 第二行小字：有新结果时提示确认，否则单项复查显示分析摘要
  const detail = (x: ScheduleItem) => {
    if (x.newResult) return <span className="detail new">{t("member.scheduleNewResult", { date: x.newResult })}</span>;
    if (x.kind === "recheck" && x.codes.length === 1 && x.params.summary) return <span className="detail">{String(x.params.summary)}</span>;
    return null;
  };
  const tone = (x: ScheduleItem) => (x.overdue ? " over" : x.soon ? " soon" : "");
  const row = (x: ScheduleItem) => {
    const editable = action && (x.kind === "recheck" || x.kind === "annual-checkup"); // 用药结束、有效期到用药页处理
    return (
      <div key={`${x.kind}-${x.due}-${x.codes.join()}-${String(x.params.name ?? "")}`} className={`a-row sched${tone(x)}`}>
        <Link href={reminderHref({ ...x, code: x.codes[0] })} className="sched-link">
          <span className="kind">{t(`reminder.kind.${x.kind}`)}</span>
          <span className="dot" />
          <span className="main">
            <span className="title">{title(x)}</span>
            {detail(x)}
          </span>
          <span className="when">
            <span className="mono">{x.due}</span> · {when(x)}
            {x.originalDue && <span className="rolled">{t("member.scheduleRolled", { date: x.originalDue })}</span>}
          </span>
          {!editable && <ChevronRight size={16} className="chev" />}
        </Link>
        {editable && <ScheduleActions action={action} kind={x.kind === "recheck" ? "recheck" : "checkup"} codes={x.codes} due={x.due} newResult={x.newResult} />}
      </div>
    );
  };

  return (
    <div className="a-panel a-rows a-sched">
      {items.slice(0, SHOWN).map(row)}
      {items.length > SHOWN && (
        <details>
          <summary>{t("member.scheduleMore", { count: items.length })}</summary>
          {items.slice(SHOWN).map(row)}
        </details>
      )}
    </div>
  );
}
