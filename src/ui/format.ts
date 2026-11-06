import type { Range } from "@/core/analysis";

export function rangeText(r: Range, refText?: string): string {
  if (r.low !== undefined && r.high !== undefined) return `${r.low}–${r.high_exclusive ? "<" : ""}${r.high}`;
  if (r.high !== undefined) return `${r.high_exclusive ? "<" : "≤"} ${r.high}`;
  if (r.low !== undefined) return `≥ ${r.low}`;
  return refText ?? "—";
}

const decimals = (n: number) => (String(n).split(".")[1] ?? "").length;

/** 与上次相比的变化：「↑ 0.8」/「↓ 1.2」/「→」；没有可比的数值上次时返回空串。小数位取两者中较多的，避免浮点尾巴 */
export function deltaText(value: number | string, previous?: number | string): string {
  if (typeof value !== "number" || typeof previous !== "number") return "";
  if (value === previous) return "→";
  const d = Math.abs(value - previous).toFixed(Math.min(4, Math.max(decimals(value), decimals(previous))));
  return `${value > previous ? "↑" : "↓"} ${d}`;
}

/** 日期缩写成 YY-MM，用于小图横轴 */
export const shortDate = (iso: string) => iso.slice(2, 7);


/** 列表行右侧数值的 class：文字结论（心电图、CT…）可换行、不挤压左侧日期和标题 */
export const valClass = (v: unknown) => (typeof v === "string" ? "val text" : "val");
