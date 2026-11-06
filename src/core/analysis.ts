import type { Catalog, CatalogEntry, FlagValue, HealthRecord, MemberBundle, Profile, Reading } from "./schema";

export interface Range { low?: number; high?: number; /** 上限不含边界：正常要 < high，等于 high 就算偏高 */ high_exclusive?: boolean }

export interface LatestReading {
  code: string;
  name: string;
  category: string;
  date: string;
  recordSlug: string;
  value: number | string;
  unit: string;
  range: Range;
  flag: FlagValue | null;
  previous?: number | string;
}

export interface SeriesPoint { date: string; value: number; unit: string; low?: number; high?: number; flag: FlagValue | null; recordSlug: string }

function catalogRange(entry: CatalogEntry | undefined, sex?: Profile["sex"]): Range {
  if (!entry) return {};
  const bySex = sex === "male" ? entry.ref_male : sex === "female" ? entry.ref_female : undefined;
  return bySex ?? entry.ref ?? {};
}

/** 单位比较用的规范写法：大小写、μ/u，以及同一单位的不同写法（心率 bpm = 次/分） */
const UNIT_SYNONYMS: Record<string, string> = { "bpm": "/min", "次/分": "/min", "次/分钟": "/min", "beats/min": "/min" };
const sameUnit = (a: string, b: string) => unitKey(a) === unitKey(b);
const unitKey = (u: string) => { const k = u.trim().toLowerCase().replace(/μ|µ/g, "u"); return UNIT_SYNONYMS[k] ?? k; };
export const unitsComparable = (reading: Reading, entry?: CatalogEntry) =>
  !reading.unit || !entry?.unit || unitKey(reading.unit) === unitKey(entry.unit);

export function effectiveRange(reading: Reading, entry: CatalogEntry | undefined, sex?: Profile["sex"]): Range {
  if (reading.ref_low !== undefined || reading.ref_high !== undefined) {
    return { low: reading.ref_low, high: reading.ref_high };
  }
  // 单位不同（如 mg/dL vs mmol/L）时 catalog 的默认范围不可用，留给报告范围或人工换算
  return unitsComparable(reading, entry) ? catalogRange(entry, sex) : {};
}

/** 结论里常见的异常描述词：主语里出现这些词就不算「X 未见异常」式的正常句 */
const FINDING_WORDS = /结节|囊肿|息肉|结石|斑块|钙化|增[厚多大强生]|减[少低弱退]|肥大|占位|异常|改变|阳性|待查|不齐|过[缓速]|偏[高低]|积液|狭窄|扩张|脂肪|肿|炎|损/u;

/** 否定词：「非正常心电图」「心电图不正常」「非窦性心律」「not normal」不是正常结论 */
const NEGATION = /[不非无没未否]/u;
const EN_NEGATION = /\b(?:not|no|non|never|without|abnormal)\b|n't/i;

/**
 * 「内科/外科均未见明显异常」「外眼未见明显异常」「ecg normal」：短主语（2–12 字、不含异常描述和否定词）+ 正常结论。
 * 英文正常词必须是独立的词：「abnormal」不能被当成「ab + normal」。
 */
function subjectThenNormal(part: string, normals: string[]): boolean {
  return normals.some((n) => {
    if (n.length < 2 || !part.endsWith(n)) return false;
    const rest = part.slice(0, -n.length);
    if (/^[a-z]/.test(n) && rest && !/[\s/]$/u.test(rest)) return false; // 词边界
    return isPlainSubject(rest.trim().replace(/均$|都$/u, ""));
  });
}

/** 主语：2–12 个汉字 / 字母，不含异常描述和否定词 */
const isPlainSubject = (subject: string) =>
  subject.length >= 2 && subject.length <= 12 && /^[\p{Script=Han}a-z/、 ]+$/u.test(subject)
  && !FINDING_WORDS.test(subject) && !NEGATION.test(subject) && !EN_NEGATION.test(subject);

/**
 * 文字结果判定。检查结论（exact）是自由文本：按标点切段，每段都是正常结论才判 N
 * （「窦性心律，正常心电图」→ N；「窦性心律，ST-T 改变」→ A）；化验定性结果（「阴性(-)」）按前缀。
 */
function textFlag(value: string, normals: string[], mode?: "exact" | "prefix"): FlagValue {
  const v = value.trim().toLowerCase();
  const ok = normals.map((n) => n.toLowerCase());
  if (mode === "exact") {
    const parts = v.split(/[。.,，;；\n]+/u).map((x) => x.trim()).filter(Boolean);
    return parts.length > 0 && parts.every((x) => ok.includes(x) || subjectThenNormal(x, ok)) ? "N" : "A";
  }
  return ok.some((n) => v === n || v.startsWith(n)) ? "N" : "A";
}

/** 定性项目（尿潜血「+/-」、尿白细胞「1+」）没有高低：报告的 ↑↓ 显示为「异常」 */
const qualitativeFlag = (reading: Reading, flag: FlagValue, entry?: CatalogEntry): FlagValue =>
  (flag === "H" || flag === "L") && typeof reading.value === "string" && entry?.normal_text && entry.category !== EXAM_CAT ? "A" : flag;
const EXAM_CAT = "检查结论";

const aboveHigh = (v: number, r: Range) => r.high !== undefined && (r.high_exclusive ? v >= r.high : v > r.high);

export function computeFlag(reading: Reading, range: Range, entry?: CatalogEntry): FlagValue | null {
  if (reading.flag) return qualitativeFlag(reading, reading.flag, entry);
  if (typeof reading.value === "number") {
    if (range.low === undefined && range.high === undefined) return null;
    if (aboveHigh(reading.value, range)) return "H";
    if (range.low !== undefined && reading.value < range.low) return "L";
    return "N";
  }
  const normals = entry?.normal_text ?? (reading.ref_text ? [reading.ref_text] : []);
  return normals.length ? textFlag(reading.value, normals, entry?.normal_match) : null;
}

export const isAbnormal = (flag: FlagValue | null) => flag === "H" || flag === "L" || flag === "A";

/** 一份记录里「其他项目」（字典未收录，如过敏原 sIgE）中标了异常的条数：它们不进指标统计，但记录的异常数要算上 */
export const otherAbnormalCount = (r: Pick<HealthRecord, "other_items">) => (r.other_items ?? []).filter((x) => isAbnormal(x.flag ?? null)).length;

/** 每个「其他项目」按名称取最近一次结果，只留异常的（新到旧）：概览单独列出，不混进指标统计 */
export function latestOtherAbnormal(m: Pick<MemberBundle, "records">) {
  const seen = new Set<string>();
  const out: { name: string; value: number | string; unit?: string; ref_text?: string; flag: FlagValue; date: string; record: string }[] = [];
  for (const r of [...m.records].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const x of r.other_items ?? []) {
      const k = x.name.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      if (x.flag && isAbnormal(x.flag)) out.push({ name: x.name, value: x.value, unit: x.unit, ref_text: x.ref_text, flag: x.flag, date: r.date, record: r.slug });
    }
  }
  return out;
}

const byDateAsc = <T extends { date: string }>(a: T, b: T) => a.date.localeCompare(b.date);

export function latestReadings(m: MemberBundle, catalog: Catalog): LatestReading[] {
  const out = new Map<string, LatestReading>();
  for (const rec of [...m.records].sort(byDateAsc)) {
    for (const r of rec.indicators) {
      const entry = catalog.get(r.code);
      const range = effectiveRange(r, entry, m.profile?.sex);
      const unit = r.unit ?? entry?.unit ?? "";
      const prev = out.get(r.code);
      out.set(r.code, {
        code: r.code,
        name: entry?.name ?? r.name ?? r.code,
        category: entry?.category ?? "其他",
        date: rec.date,
        recordSlug: rec.slug,
        value: r.value,
        unit,
        range,
        flag: computeFlag(r, range, entry),
        // 跨单位的上次值没有可比性，不给出，避免"上次 5 → 本次 100"式的误读
        previous: prev && sameUnit(prev.unit, unit) ? prev.value : undefined,
      });
    }
  }
  return [...out.values()];
}

export const abnormalReadings = (m: MemberBundle, catalog: Catalog) =>
  latestReadings(m, catalog).filter((r) => isAbnormal(r.flag));

// 只保留与最新读数同单位的点，避免不同单位混在一条曲线里
export function series(m: MemberBundle, catalog: Catalog, code: string): SeriesPoint[] {
  const entry = catalog.get(code);
  const points: SeriesPoint[] = [];
  for (const rec of [...m.records].sort(byDateAsc)) {
    for (const r of rec.indicators) {
      if (r.code !== code || typeof r.value !== "number") continue;
      const range = effectiveRange(r, entry, m.profile?.sex);
      const unit = r.unit ?? entry?.unit ?? "";
      points.push({ date: rec.date, value: r.value, unit, ...range, flag: computeFlag(r, range, entry), recordSlug: rec.slug });
    }
  }
  const unit = points.at(-1)?.unit;
  // 同一单位的不同写法（心率 bpm / 次/分）算同一条曲线；真正不同的单位（Lp(a) mg/L vs nmol/L）仍分开
  return points.filter((p) => sameUnit(p.unit, unit ?? ""));
}

/** 本来就不判高低的测量项（身高、体重、腰围…）：字典里没有范围，报告也没印——不算「无法判定」 */
export function measureOnly(r: Pick<LatestReading, "code" | "range" | "flag">, catalog: Catalog): boolean {
  // 只认字典里明确标为纯测量的项目；有任何判定（报告标记或范围算出的）都保留，不隐藏
  if (r.flag !== null || r.range.low !== undefined || r.range.high !== undefined) return false;
  return catalog.get(r.code)?.measure_only === true;
}

/** 最新结果汇总（不把身高体重这类纯测量项算进「无法判定」） */
export const summarizeLatest = (latest: LatestReading[], catalog: Catalog) =>
  summarize(latest.filter((r) => !measureOnly(r, catalog)).map((r) => r.flag));

export function summarize(flags: (FlagValue | null)[]) {
  return {
    abnormal: flags.filter(isAbnormal).length,
    unknown: flags.filter((f) => f === null).length,
    normal: flags.filter((f) => f === "N").length,
  };
}

// 日程与提醒拆到 schedule.ts；这里重新导出，保持原有导入路径
export * from "./schedule";
export * from "./regimen";
