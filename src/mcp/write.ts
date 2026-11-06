import { addDays, addMonths, computeFlag, effectiveRange, isAbnormal } from "@/core/analysis";
import type { RawDoc, RawVault, VaultSnapshot } from "@/core/bundle";
import type { OtherItem, Relation } from "@/core/schema";
import { mergeMeasures } from "@/server/quick-entry";
import { ToolError, findMember } from "./tools";

// MCP 写入（M3.2）的纯函数部分：把工具参数变成要写入的文档，便于不起数据库直接测试。
// 写入本身走 PgRepository.applyChanges（整体校验 + 记录 agent_change，可在网页一键还原）。

const compact = (date: string) => date.replaceAll("-", "");
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export function currentDoc(raw: RawVault, member: string, kind: RawDoc["kind"], key = ""): RawDoc | undefined {
  if (!raw.family.members.some((m) => m.id === member)) throw new ToolError(`member "${member}" not found — call list_members for valid ids`);
  return raw.docs[member]?.find((d) => d.kind === kind && d.key === key);
}

export interface ProfilePatch {
  relation?: Relation; birth_date?: string;
  height_cm?: number; weight_kg?: number; blood_type?: string;
  conditions?: string[]; allergies?: string[]; family_history?: string[];
  habits?: { sleep?: string; diet?: string; exercise?: string; smoking?: string; alcohol?: string; other?: string };
  checkup_interval_months?: number; notes?: string;
}

/** 只改给出的字段：列表整体替换，habits 按子项合并，notes 替换正文 */
export function patchProfileDoc(prev: RawDoc | undefined, p: ProfilePatch, today: string) {
  if (!prev) throw new ToolError("this member has no profile yet — create it on the Deepfy website first");
  const { notes, habits, ...fields } = p;
  const exact = fields.birth_date ? { birth_estimated: undefined } : {}; // 给了准确生日就不再是估算
  const data = clean({ ...prev.data, ...fields, ...exact, habits: habits ? { ...(prev.data.habits as object | undefined), ...habits } : prev.data.habits, updated: today });
  return { data, body: notes ?? prev.body };
}

export const MEASURE_ARGS = { weight_kg: "WEIGHT", systolic: "SBP", diastolic: "DBP", heart_rate: "HR", fasting_glucose: "FBG" } as const;
export type MeasureArgs = Partial<Record<keyof typeof MEASURE_ARGS, number>> & { date: string };

export function measuresDoc(prev: RawDoc | undefined, a: MeasureArgs) {
  if (prev && prev.data.type !== "manual") throw new ToolError("a non-manual record already uses this date's daily key");
  const form = { date: a.date, ...Object.fromEntries(Object.entries(MEASURE_ARGS).map(([arg, code]) => [code, a[arg as keyof typeof MEASURE_ARGS]])) };
  const next = mergeMeasures(prev, form as Parameters<typeof mergeMeasures>[1]);
  if (!next) throw new ToolError("no measurement given");
  return next;
}

/** agent 常把日期也写进标题（「20260210 过敏原…」），key 会变成「20260210 20260210 …」：标题开头与记录日期相同的日期去掉 */
export function stripDatePrefix(date: string, title: string) {
  const d = compact(date);
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  // 「2026 01 02」：带斜杠的旧标题存成 key 时斜杠被换成了空格（recordKey），反查旧记录要认得
  for (const p of [d, iso, iso.replaceAll("-", "/"), iso.replaceAll("-", "."), iso.replaceAll("-", " ")]) {
    if (title.startsWith(p)) {
      const rest = title.slice(p.length).replace(/^[\s·_\-—:：,，]+/, "");
      return rest || title; // 标题只有日期时保留原样
    }
  }
  return title;
}

/** 检测记录 key：日期 + 标题（去掉路径字符），与 vault 文件名一致 */
export function recordKey(date: string, title: string) {
  const safe = title.replace(/[/\\\u0000-\u001f]/g, " ").replaceAll("..", ".").replace(/^\.+/, "").trim();
  return `${compact(date)} ${safe}`.slice(0, 200);
}

export interface RecordInput {
  date: string; type: "checkup" | "lab" | "device"; title: string; institution?: string; notes?: string;
  indicators: { code: string; name?: string; value: number | string; unit?: string; ref_low?: number; ref_high?: number; ref_text?: string; flag?: "H" | "L" | "N" | "A" }[];
  /** 字典里没有 code 的项目，原样保留 */
  other_items?: OtherItem[];
  /** 报告上标注的总项数，用来核对是否漏录 */
  report_item_count?: number;
}

/** 一份常规体检通常包含的部分（按字典类别）；只录了一部分时提示 agent 回头逐页核对 */
const CHECKUP_SECTIONS = ["体征", "血常规", "尿常规", "肝功能", "肾功能", "血脂", "血糖", "检查结论"] as const;

/** 报告标了总项数时核对：已映射 + 其他项目 是否等于报告总数 */
function coverageOf(r: RecordInput) {
  if (!r.report_item_count) return undefined;
  const other = r.other_items?.length ?? 0;
  return { reported: r.report_item_count, mapped: r.indicators.length, other_items: other, gap: r.report_item_count - r.indicators.length - other };
}

/** 预览：每项的 flag（按报告参考范围优先，其次字典）、字典里没有的 code、是否已存在同名记录 */
export function previewRecord(s: VaultSnapshot, member: string, r: RecordInput, key: string) {
  const m = findMember(s, member);
  const rows = r.indicators.map((x) => {
    const entry = s.catalog.get(x.code);
    const flag = computeFlag(x, effectiveRange(x, entry, m.profile?.sex), entry);
    return { code: x.code, name: x.name ?? entry?.name, value: x.value, unit: x.unit ?? entry?.unit, flag, known: !!entry };
  });
  const sections: Record<string, number> = {};
  for (const x of r.indicators) {
    const cat = s.catalog.get(x.code)?.category ?? "unknown";
    sections[cat] = (sections[cat] ?? 0) + 1;
  }
  const missing = r.type === "checkup" ? CHECKUP_SECTIONS.filter((c) => !sections[c]) : [];
  const other = r.other_items?.length ?? 0;
  const coverage = coverageOf(r);
  return {
    record: key, exists: m.records.some((x) => x.slug === key),
    sections, ...(missing.length ? { possibly_missing: missing } : {}),
    other_items: other, ...(coverage ? { coverage } : {}),
    items: rows.length, abnormal: rows.filter((x) => isAbnormal(x.flag)).map((x) => `${x.code} ${x.value} (${x.flag})`),
    unknown_codes: rows.filter((x) => !x.known).map((x) => x.code),
    indicators: rows,
  };
}

/** 新建或替换记录；替换时继承原记录的附件关联（不然报告 PDF / 照片会和记录脱钩） */
export const recordDoc = (r: RecordInput, prev?: RawDoc) => ({
  data: clean({
    date: r.date, type: r.type, title: r.title, institution: r.institution,
    attachments: (prev?.data.attachments as string[] | undefined) ?? [],
    indicators: r.indicators.map((x) => clean({ ...x })),
    ...(r.other_items?.length ? { other_items: r.other_items.map((x) => clean({ ...x })) } : {}),
  }),
  body: r.notes ?? prev?.body ?? "",
});

// ---- 日程：改日期 / 确认已检查（网页「接下来」与 MCP update_schedule 共用） ----

export interface ScheduleEdit {
  kind: "recheck" | "checkup";
  /** 复查的指标 code（同一天合并的复查可一次传多个） */
  codes?: string[];
  action: "done" | "reschedule";
  date?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 新日期须是真实日期，且在今天前 1 年到后 5 年之间 */
function checkDate(date: string | undefined, today: string): string {
  if (!date || !ISO.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new ToolError("date must be a valid YYYY-MM-DD");
  }
  if (date < addDays(today, -366) || date > addMonths(today, 60)) throw new ToolError("date must be within 1 year before and 5 years after today");
  return date;
}

/** 复查：done 写 rechecked；reschedule 改 recheck 并清掉 rechecked。体检：写 profile.next_checkup（done = 今天 + 体检间隔） */
export function scheduleChanges(raw: RawVault, member: string, e: ScheduleEdit, today: string) {
  const date = e.action === "reschedule" ? checkDate(e.date, today) : undefined;
  if (e.kind === "checkup") {
    const prev = currentDoc(raw, member, "profile");
    if (!prev) throw new ToolError("member has no profile yet");
    const interval = Number(prev.data.checkup_interval_months ?? 12);
    const next_checkup = date ?? addMonths(today, interval);
    return [{ op: "put" as const, member, kind: "profile" as const, key: "", data: { ...prev.data, next_checkup, updated: today }, body: prev.body }];
  }
  const codes = [...new Set(e.codes ?? [])];
  if (!codes.length) throw new ToolError("codes is required for a recheck");
  return codes.map((code) => {
    const prev = currentDoc(raw, member, "note", code);
    if (!prev?.data.recheck) throw new ToolError(`no scheduled recheck for ${code}`);
    const data: Record<string, unknown> = date ? { ...prev.data, recheck: date, updated: today } : { ...prev.data, rechecked: today };
    if (date) delete data.rechecked;
    return { op: "put" as const, member, kind: "note" as const, key: code, data, body: prev.body };
  });
}
