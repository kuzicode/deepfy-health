import { z } from "zod";

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期需为 YYYY-MM-DD").refine(isRealDate, "不是有效的日历日期"),
);
const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "id 只能用小写字母、数字、连字符");
const code = z.string().regex(/^[A-Z0-9_]+$/, "指标 code 需为大写字母/数字/下划线");

export const Sex = z.enum(["male", "female"]);
const Flag = z.enum(["H", "L", "N", "A"]);

const MemberDir = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 _-]*$/, "目录名只能用字母、数字、空格、下划线、连字符，且以字母或数字开头");

export const FamilyMemberSchema = z.object({
  id,
  name: z.string().trim().min(1, "名字不能为空").refine((s) => !/[\n[\]|#^]/.test(s), "名字不能包含换行或 [ ] | # ^"),
  role: z.enum(["admin", "member"]).default("member"),
  dir: MemberDir.optional(),
  email: z.string().optional(),
});

export const FamilySchema = z.object({
  family: z.string().optional(),
  members: z.array(FamilyMemberSchema).default([]),
});

/** high_exclusive：上限不含边界（「< 100」，到 100 就算偏高）；连续数值不能靠减 1 表达阈值，否则 99.5 会被提前判高 */
const Range = z.object({ low: z.number().optional(), high: z.number().optional(), high_exclusive: z.boolean().optional() });

export const CatalogEntrySchema = z.object({
  code,
  name: z.string(),
  name_en: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  category: z.string(),
  unit: z.string().default(""),
  ref: Range.optional(),
  ref_male: Range.optional(),
  ref_female: Range.optional(),
  normal_text: z.array(z.string()).optional(),
  /** exact：整句等于正常词才判正常（检查结论）；默认 prefix（化验定性结果） */
  normal_match: z.enum(["exact", "prefix"]).optional(),
  /** 纯测量项（身高、体重、视力…）：本身不分高低，没有报告范围 / 标记时不算「无法判定」 */
  measure_only: z.boolean().optional(),
  /** 医院也常用、但不能和 unit 直接换算的单位（如 Lp(a) 的 nmol/L）：带报告参考范围时不报单位警告；趋势仍按单位分开 */
  alt_units: z.array(z.string()).optional(),
  note: z.string().optional(),
});
export const CatalogFileSchema = z.object({ indicators: z.array(CatalogEntrySchema).default([]) });

/** 与账号主人的关系（昵称随便起，关系给 agent 用来对上「我妈」「老爸」这类说法） */
export const RELATIONS = ["self", "spouse", "father", "mother", "son", "daughter", "grandfather", "grandmother", "sibling", "other"] as const;

export const ProfileSchema = z.object({
  id,
  name: z.string(),
  sex: Sex,
  birth_date: isoDate,
  /** 建档时只填了大概年龄：birth_date 是估算值，显示「约 N 岁」 */
  birth_estimated: z.boolean().optional(),
  relation: z.enum(RELATIONS).optional(),
  /** 网页上给这位家人选的预设头像 id（见 src/avatars.ts）；不填按成员 id 自动分配。只是外观，agent 不改 */
  avatar: z.string().optional(),
  height_cm: z.number().positive().optional(),
  weight_kg: z.number().positive().optional(),
  blood_type: z.string().optional(),
  conditions: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  family_history: z.array(z.string()).default([]),
  habits: z
    .object({
      sleep: z.string().optional(),
      diet: z.string().optional(),
      exercise: z.string().optional(),
      smoking: z.string().optional(),
      alcohol: z.string().optional(),
      other: z.string().optional(),
    })
    .default({}),
  checkup_interval_months: z.number().int().positive().default(12),
  /** 手动设定的下次体检日期（晚于最近一次体检记录时生效；之后录入新体检则回到按间隔推算） */
  next_checkup: isoDate.optional(),
  updated: isoDate.optional(),
});

const ReadingSchema = z.object({
  code,
  name: z.string().optional(),
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  ref_low: z.number().optional(),
  ref_high: z.number().optional(),
  ref_text: z.string().optional(),
  flag: Flag.optional(),
});

/** 报告里有、字典里还没有 code 的项目：原样保留，不进趋势与异常判断（字典更新后可再映射） */
export const OtherItemSchema = z.object({
  name: z.string().min(1).max(80),
  value: z.union([z.number(), z.string().max(200)]),
  unit: z.string().max(30).optional(),
  ref_text: z.string().max(60).optional(),
  section: z.string().max(30).optional(),
  flag: Flag.optional(),
});

export const RecordSchema = z.object({
  date: isoDate,
  type: z.enum(["checkup", "lab", "device", "manual"]),
  title: z.string(),
  institution: z.string().optional(),
  attachments: z.array(z.string()).default([]),
  indicators: z.array(ReadingSchema).default([]),
  other_items: z.array(OtherItemSchema).max(300).default([]),
}).refine((r) => r.indicators.length + r.other_items.length > 0, { message: "至少一项指标或其他项目", path: ["indicators"] });

export const IndicatorNoteSchema = z.object({
  code,
  updated: isoDate,
  status: z.enum(["attention", "watch", "normal"]),
  summary: z.string(),
  recheck: isoDate.optional(),
  /** 用户确认「已检查」的日期；有它就不再出现在日程里（改复查日期或重写笔记时清掉） */
  rechecked: isoDate.optional(),
});

export const RegimenItemSchema = z.object({
  id,
  name: z.string(),
  kind: z.enum(["medication", "supplement"]),
  dose: z.string(),
  /** 具体钟点；不知道或按需时留空（看 frequency / as_needed） */
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间需为 00:00–23:59")).default([]),
  days: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).optional(),
  with_food: z.boolean().optional(),
  start: isoDate,
  end: isoDate.optional(),
  reason: z.string().optional(),
  related: z.array(code).default([]),
  doctor_confirmed: z.boolean().default(false),
  /** suggested：agent 建议、用户还没决定（只有补剂能用，不进今日安排和提醒）；stopped：已停用，保留历史；不写 = 在用 */
  status: z.enum(["suggested", "active", "stopped"]).optional(),
  stopped_on: isoDate.optional(),
  stop_reason: z.string().max(200).optional(),
  /** prescribed：医生开的；self：自己买 / 自己决定吃的；agent：agent 建议的 */
  source: z.enum(["prescribed", "self", "agent"]).optional(),
  prescriber: z.string().max(100).optional(),
  /** 写入依据：用户原话或处方内容（agent 写入时必填，建议中的补剂除外） */
  basis: z.string().max(300).optional(),
  /** 文字频率（「每日 2 次，早晚」）：不知道具体钟点时用，times 可以留空 */
  frequency: z.string().max(60).optional(),
  /** 按需使用：不进今日定时安排 */
  as_needed: z.boolean().optional(),
  precautions: z.array(z.string().min(1).max(200)).max(10).optional(),
  brand: z.string().max(80).optional(),
  /** 规格 / 主要成分：每粒 D3 1000 IU */
  spec: z.string().max(120).optional(),
  /** 有效期至：临近时进「接下来」和提醒邮件 */
  expiry: isoDate.optional(),
}).superRefine((v, ctx) => {
  if (v.kind === "medication" && (v.status === "suggested" || v.source === "agent")) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "药物只记录医生开的或用户明确在吃的，不能是 agent 建议" });
  }
  if (v.status === "stopped" && !v.stopped_on) ctx.addIssue({ code: "custom", path: ["stopped_on"], message: "已停用的条目需要停用日期" });
});
export const RegimenSchema = z.object({
  updated: isoDate.optional(),
  items: z.array(RegimenItemSchema).default([]),
});

/** 健康日志：症状 / 备注（快速建档用，不需要完整报告）；正文是详细描述 */
export const LogSchema = z.object({
  date: isoDate,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间需为 00:00–23:59").optional(),
  type: z.enum(["symptom", "note"]).default("symptom"),
  title: z.string().min(1).max(120),
  severity: z.number().int().min(1).max(3).optional(),
  tags: z.array(z.string().max(30)).max(20).default([]),
  attachments: z.array(z.string()).max(6).default([]),
});

export const CarePlanSchema = z.object({
  updated: isoDate,
  focus: z.array(code).default([]),
});

export type Family = z.infer<typeof FamilySchema>;
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type Relation = (typeof RELATIONS)[number];
export type Reading = z.infer<typeof ReadingSchema>;
export type FlagValue = z.infer<typeof Flag>;
export type RegimenItem = z.infer<typeof RegimenItemSchema>;

export type OtherItem = z.infer<typeof OtherItemSchema>;
/** other_items 在类型上可选：旧记录 / 测试构造的记录没有这个字段 */
export type HealthRecord = Omit<z.infer<typeof RecordSchema>, "other_items"> & { other_items?: OtherItem[]; slug: string; body: string };
export type IndicatorNote = z.infer<typeof IndicatorNoteSchema> & { body: string };
type Regimen = z.infer<typeof RegimenSchema> & { body: string };
type CarePlan = z.infer<typeof CarePlanSchema> & { body: string };
export type HealthLog = z.infer<typeof LogSchema> & { slug: string; body: string };
export type Catalog = Map<string, CatalogEntry>;

export interface MemberBundle {
  id: string;
  name: string;
  dir?: string;
  role: "admin" | "member";
  profile?: Profile & { body: string };
  records: HealthRecord[];
  notes: Map<string, IndicatorNote>;
  logs: HealthLog[];
  regimen?: Regimen;
  carePlan?: CarePlan;
}

export interface ValidationIssue {
  level: "error" | "warning";
  file: string;
  message: string;
}
