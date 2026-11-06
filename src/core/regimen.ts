import type { MemberBundle, RegimenItem } from "./schema";

// 用药与补剂的纯逻辑：状态分组、当天安排、写入时的确定性检查、趋势图区间。
// 不做药品库：相互作用由 agent 判断，这里只提供名称比对这类不会误判医学含义的检查。

type WithItems = Pick<MemberBundle, "regimen">;

const EXPIRY_SOON_DAYS = 30;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export const itemStatus = (i: Pick<RegimenItem, "status">) => i.status ?? "active";
const byStatus = (m: WithItems, s: ReturnType<typeof itemStatus>) => (m.regimen?.items ?? []).filter((i) => itemStatus(i) === s);
export const activeItems = (m: WithItems) => byStatus(m, "active");
export const suggestedItems = (m: WithItems) => byStatus(m, "suggested");
export const stoppedItems = (m: WithItems) => byStatus(m, "stopped");

/** 实际吃到哪天：提前停用的以停用日为准（当天起不再吃） */
function takenOn(item: RegimenItem, date: string): boolean {
  if (itemStatus(item) === "suggested" || date < item.start) return false;
  if (item.stopped_on) return date < item.stopped_on;
  return !item.end || date <= item.end;
}

function activeOn(item: RegimenItem, date: string): boolean {
  if (!takenOn(item, date)) return false;
  if (!item.days) return true;
  return item.days.includes(WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]);
}

export interface DoseSlot { memberId: string; time: string; itemId: string; name: string; kind: RegimenItem["kind"]; dose: string; with_food?: boolean; doctor_confirmed: boolean }

/** 当天的定时安排（给定时任务用）；按需和没有钟点的不在这里，见 untimedOn */
export function regimenOn(m: MemberBundle, date: string): DoseSlot[] {
  return (m.regimen?.items ?? [])
    .filter((i) => activeOn(i, date) && !i.as_needed)
    .flatMap((i) =>
      i.times.map((time) => ({
        memberId: m.id, time, itemId: i.id, name: i.name, kind: i.kind, dose: i.dose,
        with_food: i.with_food, doctor_confirmed: i.doctor_confirmed,
      })),
    )
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** 当天在用、但没有具体钟点的条目：按需，或只写了文字频率 */
export const untimedOn = (m: WithItems, date: string) =>
  (m.regimen?.items ?? []).filter((i) => activeOn(i, date) && (i.as_needed || i.times.length === 0));

export function expiryState(item: Pick<RegimenItem, "expiry">, today: string): "expired" | "soon" | undefined {
  if (!item.expiry) return undefined;
  const days = Math.round((Date.parse(`${item.expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return "expired";
  return days <= EXPIRY_SOON_DAYS ? "soon" : undefined;
}

const norm = (s: string) => s.replace(/[（(].*?[）)]/g, "").replace(/\s+/g, "").toLowerCase();
/** 名称互相包含才算同一种：至少 2 个字，避免单字误判 */
const overlaps = (a: string, b: string) => a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));

export type RegimenWarning =
  | { code: "duplicate"; other: string }
  | { code: "allergy"; allergy: string }
  | { code: "expired" | "expiring"; expiry: string };

function duplicateOf(item: RegimenItem, m: WithItems) {
  const name = norm(item.name);
  const others = (m.regimen?.items ?? []).filter((x) => x.id !== item.id && itemStatus(x) !== "stopped");
  return others.find((x) => overlaps(name, norm(x.name)) || (x.spec && overlaps(name, norm(x.spec))))?.name;
}

const allergyHits = (item: RegimenItem, allergies: string[]) => {
  const label = norm(`${item.name} ${item.spec ?? ""} ${item.brand ?? ""}`);
  return allergies.filter((a) => norm(a).length >= 2 && label.includes(norm(a)));
};

/** 写入和展示时的确定性检查，item 可以是还没保存的预览 */
export function regimenWarnings(item: RegimenItem, m: WithItems & Pick<MemberBundle, "profile">, today: string): RegimenWarning[] {
  const out: RegimenWarning[] = [];
  const twin = duplicateOf(item, m);
  if (twin) out.push({ code: "duplicate", other: twin });
  for (const allergy of allergyHits(item, m.profile?.allergies ?? [])) out.push({ code: "allergy", allergy });
  const exp = expiryState(item, today);
  if (exp) out.push({ code: exp === "expired" ? "expired" : "expiring", expiry: item.expiry! });
  return out;
}

/** 编辑表单的关联指标选项：有结果的指标 + 条目已关联但还没测过的（不列出来，保存时这些关联会被清空） */
export function relatedOptions<T extends { code: string; name: string }>(measured: T[], related: string[], nameOf: (code: string) => string) {
  const known = new Set(measured.map((m) => m.code));
  return [...measured, ...related.filter((c) => !known.has(c)).map((code) => ({ code, name: nameOf(code) }))];
}

export interface RegimenSpan { name: string; kind: RegimenItem["kind"]; start: string; end?: string; stopped: boolean }

/** 和某个指标相关的用药区间（建议中的不算，还没吃） */
export const regimenSpans = (m: WithItems, code: string): RegimenSpan[] =>
  (m.regimen?.items ?? [])
    .filter((i) => itemStatus(i) !== "suggested" && i.related.includes(code))
    .map((i) => ({ name: i.name, kind: i.kind, start: i.start, end: i.stopped_on ?? i.end, stopped: itemStatus(i) === "stopped" }))
    .sort((a, b) => a.start.localeCompare(b.start));

/**
 * 趋势图上的竖线：X 轴按检查次序等距、不是真实时间，所以画在事件日期当天或之后的第一个点上；
 * 事件早于图上第一个点、或晚于最后一个点时不画（图下方的文字仍写明准确日期）。
 */
export function spanMarks(dates: string[], spans: RegimenSpan[]) {
  const at = (d: string) => (dates.length && d > dates[0] ? dates.find((x) => x >= d) : undefined);
  return spans.flatMap((s) => {
    const start = at(s.start);
    const end = s.stopped && s.end ? at(s.end) : undefined;
    return [
      ...(start ? [{ date: start, kind: "start" as const, name: s.name }] : []),
      ...(end ? [{ date: end, kind: "end" as const, name: s.name }] : []),
    ];
  });
}
