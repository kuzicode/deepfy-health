import type { Reminder } from "@/core/analysis";
import type { CatalogEntry } from "@/core/schema";

// 动态 key（分类名、提醒类型）在这里集中处理，调用方传入 app 命名空间的 t
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T = (key: any, values?: any) => string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Has = (key: any) => boolean;

export const indicatorName = (entry: CatalogEntry | undefined, fallback: string, locale: string) =>
  (locale === "en" ? entry?.name_en : entry?.name) ?? fallback;

/** 手动记录的标题是系统写入的固定中文，不是用户内容：按界面语言显示 */
const MANUAL_TITLE = "日常记录";
export const recordTitle = (t: T, rec: { type: string; title: string }): string =>
  rec.type === "manual" && rec.title === MANUAL_TITLE ? t("records.manualTitle") : rec.title;

/** 分类名存的是中文键，英文界面查表 */
export const categoryLabel = (t: T, has: Has, cat: string) => (has(`categories.${cat}`) ? t(`categories.${cat}`) : cat);

export function reminderText(t: T, r: Reminder): string {
  const p = r.params ?? {};
  if (r.kind === "annual-checkup") return p.last ? t("reminder.annual", p) : p.scheduled ? t("reminder.annualScheduled") : t("reminder.annualFirst");
  if (r.kind === "recheck") return t("reminder.recheck", p);
  if (r.kind === "supply-expiry") return t("reminder.expiry", p);
  return t("reminder.regimen", p);
}

export function reminderHref(r: Reminder) {
  if (r.kind === "recheck" && r.code) return `/m/${r.memberId}/indicators/${r.code}`;
  return `/m/${r.memberId}/${r.kind === "regimen-review" || r.kind === "supply-expiry" ? "regimen" : "records"}`;
}
