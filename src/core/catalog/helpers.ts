import type { CatalogEntry } from "../schema";

// 内置字典的行构造工具：数值项、按性别分范围、定性项、检查结论

/** high 写 `{ below: 100 }` 表示「< 100」（不含边界），用于连续数值的阈值 */
export type Row = [code: string, name: string, unit: string, low: number | undefined, high: number | { below: number } | undefined, aliases?: string[]];
export type SexRow = [code: string, name: string, unit: string, male: [number, number], female: [number, number], aliases?: string[]];

export const num = (category: string, rows: Row[]): CatalogEntry[] =>
  rows.map(([code, name, unit, low, high, aliases = []]) => ({
    code, name, unit, category, aliases,
    ref: typeof high === "object" ? { low, high: high.below, high_exclusive: true } : { low, high },
  }));

export const bySex = (category: string, rows: SexRow[]): CatalogEntry[] =>
  rows.map(([code, name, unit, m, f, aliases = []]) => ({
    code, name, unit, category, aliases,
    ref_male: { low: m[0], high: m[1] },
    ref_female: { low: f[0], high: f[1] },
  }));

export const qual = (category: string, rows: [string, string, string[]][]): CatalogEntry[] =>
  rows.map(([code, name, aliases]) => ({ code, name, unit: "", category, aliases, normal_text: ["阴性", "-", "（-）", "(-)", "正常", "negative"] }));

/** 检查结论（心电图、超声、影像、专科）：文字结果；报告写正常 / 未见异常判 N，其余判 A（报告注明无临床意义时由录入方显式传 flag） */
const EXAM_CATEGORY = "检查结论";
const EXAM_NORMAL = [
  "未见异常", "未见明显异常", "未见明显病变", "无异常", "正常", "阴性", "窦性心律",
  "正常心电图", "大致正常心电图", "心电图正常", "心电图大致正常", "正常范围心电图",
  "negative", "normal", "normal ecg", "no abnormal", "unremarkable",
];
export const exam = (rows: [string, string, string[]][]): CatalogEntry[] =>
  rows.map(([code, name, aliases]) => ({ code, name, unit: "", category: EXAM_CATEGORY, aliases, normal_text: EXAM_NORMAL, normal_match: "exact" as const }));

/** 定性结果，自定义正常词表（尿色、色觉、乙肝表面抗体等） */
export const qualWith = (category: string, normal: string[], rows: [string, string, string[]][]): CatalogEntry[] =>
  rows.map(([code, name, aliases]) => ({ code, name, unit: "", category, aliases, normal_text: normal }));

// 成人常用参考范围，仅作兜底；录入时优先使用报告上印的范围（DATA5）
