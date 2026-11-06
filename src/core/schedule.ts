import { activeItems } from "./regimen";
import type { MemberBundle, Profile } from "./schema";

// 日期、年龄与日程：年度体检 / 复查 / 方案复评的提醒、「接下来」日程、用药方案的当天剂量。
// 从 analysis.ts 拆出（行数阈值）；analysis.ts 重新导出这里的全部内容，调用方不用改导入。

export interface Reminder {
  memberId: string;
  kind: "annual-checkup" | "recheck" | "regimen-review" | "supply-expiry";
  due: string;
  overdue: boolean;
  /** 中文文案（CLI 使用）；网页按 kind + params 生成对应语言的文案 */
  message: string;
  code?: string;
  params: Record<string, string | number>;
  /** 逾期 30 天未确认而顺延时的原定日期 */
  originalDue?: string;
  /** 已有新结果的日期（复查） */
  newResult?: string;
}

export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** 按大概年龄估一个生日：今天 − N 年 − 6 个月，保证 ageOn 正好是 N */
export const estimatedBirth = (age: number, today: string) => addMonths(today, -(age * 12 + 6));

export function bmi(p?: Profile): number | undefined {
  if (!p?.height_cm || !p.weight_kg) return undefined;
  return Math.round((p.weight_kg / (p.height_cm / 100) ** 2) * 10) / 10;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const lastCheckup = (m: MemberBundle) =>
  m.records.filter((r) => r.type === "checkup").map((r) => r.date).sort().at(-1);

const UPCOMING_DAYS = 30;
/** 逾期超过这么多天还没确认「已检查」，就顺延 ROLL_MONTHS 个月 */
const GRACE_DAYS = 30;
const ROLL_MONTHS = 6;

/** 逾期 30 天还没确认的待办顺延半年（可连续顺延）；只在计算时顺延，不改数据 */
export function rollForward(due: string, today: string): string {
  const floor = addDays(today, -GRACE_DAYS);
  let d = due;
  while (d < floor) d = addMonths(d, ROLL_MONTHS);
  return d;
}

export interface Recheck {
  code: string; due: string; summary: string;
  /** 笔记写下之后、已经录入了含这项指标的新结果（日期）——提示用户确认「已检查」 */
  newResult?: string;
}

/** 指标分析里约定、还没确认「已检查」的复查，不限时间窗口，按日期排序（不因有新结果自动消失，见 newResult） */
export function upcomingRechecks(m: MemberBundle): Recheck[] {
  return [...m.notes.values()]
    .filter((n) => n.recheck && !n.rechecked)
    .map((n) => {
      const newResult = m.records.filter((r) => r.date > n.updated && r.indicators.some((i) => i.code === n.code)).map((r) => r.date).sort().at(-1);
      return { code: n.code, due: n.recheck!, summary: n.summary, ...(newResult ? { newResult } : {}) };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.code.localeCompare(b.code));
}

/** 下次体检：手动设定的日期晚于最近一次体检时用它，否则按「上次体检 + 间隔」推算；都没有时为 undefined */
export function nextCheckup(m: MemberBundle): string | undefined {
  const last = lastCheckup(m);
  const manual = m.profile?.next_checkup;
  if (manual && (!last || manual > last)) return manual;
  return last ? addMonths(last, m.profile?.checkup_interval_months ?? 12) : undefined;
}

/**
 * 体检待办：有上次体检或手动日期时按 nextCheckup；从没体检过则「今天就该安排」（不顺延）。
 * 没有体检记录但手动定了日期 → params.scheduled，邮件照常提醒（区别于「还没安排」）。
 */
function checkupReminder(m: MemberBundle, today: string): Omit<Reminder, "memberId" | "overdue"> {
  const last = lastCheckup(m);
  const interval = m.profile?.checkup_interval_months ?? 12;
  const next = nextCheckup(m);
  const params: Reminder["params"] = last ? { last, interval } : next ? { interval, scheduled: next } : {};
  const message = last ? `距上次体检（${last}）已满 ${interval} 个月，该安排体检了` : next ? `已安排体检（${next}）` : "还没有体检记录，建议安排一次全面体检";
  return { kind: "annual-checkup", due: next ?? today, message, params };
}

/** 全部待办（不截断时间窗口）：体检、指标分析约定的复查、用药结束——网页「接下来」、提醒、邮件 / agent 共用这一个来源 */
function allReminders(m: MemberBundle, today: string): Reminder[] {
  const out: Reminder[] = [];
  const push = (r: Omit<Reminder, "memberId" | "overdue">, roll = true) => {
    const due = roll ? rollForward(r.due, today) : r.due;
    out.push({ ...r, memberId: m.id, due, overdue: due < today, ...(due !== r.due ? { originalDue: r.due } : {}) });
  };

  push(checkupReminder(m, today), nextCheckup(m) !== undefined);
  for (const r of upcomingRechecks(m)) {
    push({ kind: "recheck", due: r.due, message: `复查 ${r.code}：${r.summary}`, params: { code: r.code, summary: r.summary }, code: r.code, newResult: r.newResult });
  }
  // 只看在用的：已停用的不再逾期，建议中的还没开始吃
  for (const item of activeItems(m)) {
    if (item.end) push({ kind: "regimen-review", due: item.end, message: `${item.name} 计划于 ${item.end} 结束，评估是否继续`, params: { name: item.name, end: item.end } }, false);
    if (item.expiry) push({ kind: "supply-expiry", due: item.expiry, message: `${item.name} 有效期至 ${item.expiry}，到期前换新`, params: { name: item.name, expiry: item.expiry } }, false);
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/** 近期提醒：已逾期或 30 天内到期（首页、MCP get_reminders、CLI） */
export function reminders(m: MemberBundle, today: string): Reminder[] {
  const horizon = addDays(today, UPCOMING_DAYS);
  return allReminders(m, today).filter((r) => r.due <= horizon);
}

export interface ScheduleItem extends Reminder {
  /** 已逾期或 30 天内到期 */
  soon: boolean;
  /** 复查项的指标 code（同一天到期的复查合并为一条） */
  codes: string[];
}

/** 日程：全部待办，同一天到期的复查合并成一条（有新结果的那条取最新的新结果日期） */
export function schedule(m: MemberBundle, today: string): ScheduleItem[] {
  const horizon = addDays(today, UPCOMING_DAYS);
  const out: ScheduleItem[] = [];
  for (const r of allReminders(m, today)) {
    const same = r.kind === "recheck" ? out.find((x) => x.kind === "recheck" && x.due === r.due) : undefined;
    if (same && r.code) {
      same.codes.push(r.code);
      if (r.newResult && (!same.newResult || r.newResult > same.newResult)) same.newResult = r.newResult;
    } else out.push({ ...r, soon: r.due <= horizon, codes: r.code ? [r.code] : [] });
  }
  return out;
}

/** 两个 YYYY-MM-DD 之间相差的天数（b - a） */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
