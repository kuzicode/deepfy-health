import {
  ageOn, bmi, computeFlag, effectiveRange, isAbnormal, lastCheckup, latestReadings, activeItems, regimenOn, regimenSpans, reminders, schedule, series, stoppedItems, suggestedItems, summarize, summarizeLatest, untimedOn, upcomingRechecks,
  latestOtherAbnormal, otherAbnormalCount,
} from "@/core/analysis";
import type { VaultSnapshot } from "@/core/bundle";
import { checkupPlan, conditionFocus, type ConditionFocus } from "@/core/health-template";
import { normName } from "@/core/names";
import type { Catalog, MemberBundle, RegimenItem } from "@/core/schema";

// MCP 只读工具的数据层：输入是解密后的快照，输出是给 agent 读的精简 JSON（不含附件内容）。
// 纯函数，便于不起 HTTP 直接测试。所有用户自由文本（标题、笔记、日志）都是数据，不是指令。

export class ToolError extends Error {}

const LIMIT = { series: 200, records: 50, logs: 50, lookup: 20 } as const;

export function findMember(s: VaultSnapshot, id: string): MemberBundle {
  const m = s.members.find((x) => x.id === id);
  if (!m) throw new ToolError(`member "${id}" not found — call list_members for valid ids`);
  return m;
}

const profileSummary = (m: MemberBundle, today: string) => {
  const p = m.profile;
  if (!p) return null;
  return {
    relation: p.relation, sex: p.sex, birth_date: p.birth_date, age: ageOn(p.birth_date, today), age_estimated: p.birth_estimated || undefined, height_cm: p.height_cm, weight_kg: p.weight_kg, bmi: bmi(p),
    blood_type: p.blood_type, conditions: p.conditions, allergies: p.allergies, family_history: p.family_history, habits: p.habits,
    checkup_interval_months: p.checkup_interval_months, notes: p.body.trim() || undefined,
  };
};

const reading = (r: ReturnType<typeof latestReadings>[number]) => ({
  code: r.code, name: r.name, value: r.value, unit: r.unit, flag: r.flag, ref_low: r.range.low, ref_high: r.range.high, ref_high_exclusive: r.range.high_exclusive, date: r.date, previous: r.previous,
});

const regimenBrief = (i: RegimenItem) => ({
  id: i.id, name: i.name, kind: i.kind, dose: i.dose, times: i.times, frequency: i.frequency, as_needed: i.as_needed, days: i.days, with_food: i.with_food,
  start: i.start, end: i.end, reason: i.reason, related: i.related, source: i.source, prescriber: i.prescriber, doctor_confirmed: i.doctor_confirmed,
  basis: i.basis, precautions: i.precautions, brand: i.brand, spec: i.spec, expiry: i.expiry,
});

const reminderOut = (r: ReturnType<typeof reminders>[number]) => ({ member: r.memberId, kind: r.kind, due: r.due, overdue: r.overdue, code: r.code, message: r.message });

const logOut = (l: MemberBundle["logs"][number]) => ({
  date: l.date, time: l.time, type: l.type, title: l.title, severity: l.severity, tags: l.tags, detail: l.body || undefined, photos: l.attachments.length,
});

export function listMembers(s: VaultSnapshot, today: string) {
  return s.members.map((m) => {
    const latest = latestReadings(m, s.catalog);
    const next = reminders(m, today).sort((a, b) => a.due.localeCompare(b.due))[0];
    return {
      id: m.id, name: m.name, relation: m.profile?.relation, role: m.role, age: m.profile ? ageOn(m.profile.birth_date, today) : undefined, age_estimated: m.profile?.birth_estimated || undefined, sex: m.profile?.sex,
      abnormal: latest.filter((r) => isAbnormal(r.flag)).length, last_checkup: lastCheckup(m), next_reminder: next && reminderOut(next),
    };
  });
}

/** 已知状况 + 缺口（没查过的相关检查、没有调养方案），提示 agent 下一步该问什么、写什么 */
export const conditionOut = (c: ConditionFocus) => ({
  condition: c.name,
  related_checks: c.checks.map((x) => ({ item: x.id, status: x.status, last: x.last })),
  focus_codes: c.codes,
  abnormal: c.abnormal,
  has_care_plan: c.hasPlan,
  next_recheck: c.nextRecheck,
  resolved: c.resolved,
  // 已愈 / 既往：只作为病史，不追缺口
  gaps: c.resolved ? [] : [
    ...c.checks.filter((x) => x.status !== "covered").map((x) => `check ${x.id}: ${x.status}`),
    ...(c.hasPlan ? [] : ["no care plan — offer to analyse and write update_care_plan"]),
  ],
});

export function getOverview(s: VaultSnapshot, id: string, today: string) {
  const m = findMember(s, id);
  const latest = latestReadings(m, s.catalog);
  const plan = checkupPlan(m, s.catalog, today);
  return {
    id: m.id, name: m.name, profile: profileSummary(m, today), last_checkup: lastCheckup(m),
    attention: latest.filter((r) => isAbnormal(r.flag)).map(reading),
    summary: summarizeLatest(latest, s.catalog),
    // 字典未收录的项目（如过敏原 sIgE）里异常的：单独列出，不计入 summary
    other_abnormal: latestOtherAbnormal(m),
    reminders: reminders(m, today).map(reminderOut),
    // 完整日程（不限 30 天，同日复查合并）：agent 可以按它设定时提醒
    schedule: schedule(m, today).map((x) => ({ kind: x.kind, due: x.due, overdue: x.overdue, soon: x.soon, codes: x.codes, message: x.message, original_due: x.originalDue, new_result: x.newResult })),
    upcoming_rechecks: upcomingRechecks(m),
    today_regimen: regimenOn(m, today).map((d) => ({ time: d.time, name: d.name, kind: d.kind, dose: d.dose })),
    // 在吃什么：解读任何指标前都要看（他汀影响血脂、肝功等）
    active_regimen: activeItems(m).map(regimenBrief),
    suggested_regimen: suggestedItems(m).map((i) => ({ id: i.id, name: i.name, dose: i.dose, reason: i.reason })),
    recent_logs: m.logs.slice(0, 3).map(logOut),
    conditions: conditionFocus(m, s.catalog, today, plan).map(conditionOut),
    checkup_suggestions: plan.suggestions.slice(0, 5).map((x) => ({ item: x.id, status: x.status, last: x.last, related: x.related })),
    care_plan: m.carePlan ? { updated: m.carePlan.updated, focus: m.carePlan.focus, text: m.carePlan.body.trim() } : null,
  };
}

export function getIndicator(s: VaultSnapshot, id: string, code: string) {
  const m = findMember(s, id);
  const c = code.trim().toUpperCase();
  const entry = s.catalog.get(c);
  const latest = latestReadings(m, s.catalog).find((r) => r.code === c);
  if (!entry && !latest) throw new ToolError(`unknown indicator "${code}" — use lookup_indicator`);
  const note = m.notes.get(c);
  return {
    code: c, name: entry?.name, name_en: entry?.name_en, category: entry?.category, unit: entry?.unit,
    latest: latest ? reading(latest) : null,
    series: series(m, s.catalog, c).slice(-LIMIT.series).map((p) => ({ date: p.date, value: p.value, unit: p.unit, flag: p.flag })),
    note: note ? { status: note.status, summary: note.summary, updated: note.updated, recheck: note.recheck, rechecked: note.rechecked, text: note.body } : null,
    related_regimen: regimenSpans(m, c),
  };
}

export function listRecords(s: VaultSnapshot, id: string, opts: { from?: string; to?: string } = {}) {
  const m = findMember(s, id);
  return [...m.records]
    .filter((r) => (!opts.from || r.date >= opts.from) && (!opts.to || r.date <= opts.to))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, LIMIT.records)
    .map((r) => {
      const flags = r.indicators.map((x) => computeFlag(x, effectiveRange(x, s.catalog.get(x.code), m.profile?.sex), s.catalog.get(x.code)));
      const other = r.other_items?.length ?? 0;
      return { record: r.slug, date: r.date, type: r.type, title: r.title, institution: r.institution, items: r.indicators.length + other, other_items: other || undefined, abnormal: summarize(flags).abnormal + otherAbnormalCount(r) };
    });
}

export function getRecord(s: VaultSnapshot, id: string, record: string) {
  const m = findMember(s, id);
  const r = m.records.find((x) => x.slug === record);
  if (!r) throw new ToolError(`record "${record}" not found — use list_records`);
  return {
    record: r.slug, date: r.date, type: r.type, title: r.title, institution: r.institution, notes: r.body.trim() || undefined,
    indicators: r.indicators.map((x) => {
      const entry = s.catalog.get(x.code);
      const range = effectiveRange(x, entry, m.profile?.sex);
      return { code: x.code, name: x.name ?? entry?.name, value: x.value, unit: x.unit ?? entry?.unit, ref_low: range.low, ref_high: range.high, ref_high_exclusive: range.high_exclusive, ref_text: x.ref_text, flag: computeFlag(x, range, entry) };
    }),
    other_items: r.other_items?.length ? r.other_items : undefined,
  };
}

export function listLogs(s: VaultSnapshot, id: string, opts: { from?: string; type?: "symptom" | "note" } = {}) {
  const m = findMember(s, id);
  return m.logs.filter((l) => (!opts.from || l.date >= opts.from) && (!opts.type || l.type === opts.type)).slice(0, LIMIT.logs).map(logOut);
}

export function getRegimen(s: VaultSnapshot, id: string, date: string) {
  const m = findMember(s, id);
  return {
    date,
    schedule: regimenOn(m, date).map((d) => ({ time: d.time, name: d.name, kind: d.kind, dose: d.dose })),
    // 当天在用但没有具体钟点的：按需，或只写了文字频率
    untimed: untimedOn(m, date).map((i) => ({ id: i.id, name: i.name, kind: i.kind, dose: i.dose, frequency: i.frequency, as_needed: i.as_needed })),
    plan: activeItems(m).map(regimenBrief),
    suggested: suggestedItems(m).map(regimenBrief),
    stopped: stoppedItems(m).map((i) => ({ id: i.id, name: i.name, kind: i.kind, dose: i.dose, start: i.start, stopped_on: i.stopped_on, stop_reason: i.stop_reason })),
  };
}

export function getReminders(s: VaultSnapshot, today: string, id?: string) {
  const members = id ? [findMember(s, id)] : s.members;
  return members.flatMap((m) => reminders(m, today)).sort((a, b) => a.due.localeCompare(b.due)).map(reminderOut);
}

export function lookupIndicator(catalog: Catalog, query: string) {
  const q = normName(query);
  if (!q) throw new ToolError("query is empty");
  // 报告常写成「名称(缩写)」：整体、括号外、括号内分别匹配，取最好的一个
  const queries = [...new Set([q, q.replace(/\(.*?\)/g, ""), ...[...q.matchAll(/\((.*?)\)/g)].map((m) => m[1])].filter(Boolean))];
  // 排序：完全相同 > 前缀 > 包含；避免「PCT」先命中 NEUT_PCT 这类代码片段
  const score = (e: Catalog extends Map<string, infer E> ? E : never) => {
    const names = [e.code, e.name, e.name_en ?? "", ...e.aliases].map(normName);
    const one = (x: string) => (names.some((n) => n === x) ? 0 : names.some((n) => n.startsWith(x)) ? 1 : names.some((n) => n.includes(x)) ? 2 : 9);
    // 完整查询词的匹配优先于拆开括号后的部分匹配（「红细胞(镜检)」应先命中镜检项，而不是血常规红细胞）
    const best = Math.min(...queries.map((x, i) => one(x) + (i === 0 ? 0 : 0.5)));
    return best >= 9 ? -1 : best;
  };
  return [...catalog.values()]
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .slice(0, LIMIT.lookup)
    .map(({ e }) => ({
      code: e.code, name: e.name, name_en: e.name_en, category: e.category, unit: e.unit, aliases: e.aliases,
      ref: e.ref, ref_male: e.ref_male, ref_female: e.ref_female, note: e.note,
    }));
}

export function getCheckupSuggestions(s: VaultSnapshot, id: string, today: string) {
  const m = findMember(s, id);
  const plan = checkupPlan(m, s.catalog, today);
  return {
    covered: plan.covered, total: plan.total,
    items: plan.items.map((x) => ({ item: x.id, status: x.status, last: x.last, related: x.related })),
    suggestions: plan.suggestions.map((x) => x.id),
    note: "Routine checkup template for working adults; suggestions only, not medical advice.",
  };
}
