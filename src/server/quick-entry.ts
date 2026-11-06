import { AVATARS } from "@/avatars";
import { z } from "zod";
import type { RawDoc } from "@/core/bundle";
import { estimatedBirth } from "@/core/analysis";
import { RELATIONS, type Profile } from "@/core/schema";
import { randomId } from "./crypto";

// 网页快速建档：表单 → 文档的纯函数（server action 只负责鉴权与调用），便于单测

export type ActionState = { ok?: boolean; error?: string };

export const newMemberId = () => `m-${randomId().replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 6)}`;

const num = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(min).max(max).optional());
const OPEN = "(（[【";
const CLOSE = ")）]】";

/** 按逗号 / 顿号 / 分号 / 换行拆列表，括号里的不拆：「肺炎（2024-03，已愈）、高血压」→ 两项 */
export function splitList(v: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of v) {
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && /[,，、;；\n]/.test(ch)) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

const list = z.preprocess(
  (v) => (typeof v === "string" ? splitList(v) : v),
  z.array(z.string().max(60)).max(30).default([]),
);
const text = (max: number) => z.preprocess((v) => (typeof v === "string" ? v.trim() || undefined : v), z.string().max(max).optional());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const optDate = z.preprocess((v) => v || undefined, isoDate.optional());
const relation = z.preprocess((v) => v || undefined, z.enum(RELATIONS).optional());

/** 建档：昵称随便填，关系可选；出生日期与大概年龄二选一（年龄优先用于估算，日期更准时用日期） */
/** 预设头像 id：不在清单里的（含空）当作没选，按成员 id 自动分配 */
const avatarId = z.string().optional().transform((v) => (v && AVATARS.includes(v) ? v : undefined));

export const NewMemberForm = z.object({
  name: z.string().trim().min(1).max(40),
  relation,
  sex: z.enum(["male", "female"]),
  birth_date: optDate,
  age: num(0, 120),
  height_cm: num(50, 250),
  weight_kg: num(2, 400),
  avatar: avatarId,
}).refine((f) => f.birth_date || f.age !== undefined, { path: ["birth_date"] });

export function newMemberProfile(id: string, f: z.infer<typeof NewMemberForm>, today: string): Record<string, unknown> {
  const birth = f.birth_date ? { birth_date: f.birth_date } : { birth_date: estimatedBirth(Math.round(f.age!), today), birth_estimated: true };
  return clean({ id, name: f.name, relation: f.relation, sex: f.sex, ...birth, height_cm: f.height_cm, weight_kg: f.weight_kg, avatar: f.avatar, updated: today });
}

export const ProfileForm = z.object({
  relation,
  birth_date: optDate,
  height_cm: num(50, 250),
  weight_kg: num(2, 400),
  blood_type: text(10),
  conditions: list,
  allergies: list,
  family_history: list,
  sleep: text(200), diet: text(200), exercise: text(200), smoking: text(100), alcohol: text(100),
  checkup_interval_months: num(1, 60),
});

/** 档案编辑：只覆盖表单里的字段，保留 id / 性别 / 生日等其他字段和正文 */
export function patchProfile(current: Profile, f: z.infer<typeof ProfileForm>, today: string): Record<string, unknown> {
  const { sleep, diet, exercise, smoking, alcohol, checkup_interval_months, birth_date, ...rest } = f;
  // 填了和现在不同的生日 = 补上准确日期，去掉「估算」标记；没填则保留原来的
  const birth = birth_date && birth_date !== current.birth_date ? { birth_date, birth_estimated: undefined } : {};
  return clean({
    ...current,
    ...rest,
    ...birth,
    habits: { ...current.habits, sleep, diet, exercise, smoking, alcohol },
    checkup_interval_months: checkup_interval_months ?? current.checkup_interval_months,
    updated: today,
  });
}

export const LogForm = z.object({
  date: isoDate,
  time: z.preprocess((v) => v || undefined, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional()),
  type: z.enum(["symptom", "note"]).default("symptom"),
  title: z.string().trim().min(1).max(120),
  severity: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(1).max(3).optional()),
  tags: list,
  body: z.string().max(5000).default(""),
});

/** 日志 key：YYYYMMDD-HHmm，同一分钟已存在则加 -2、-3 */
export function logKey(date: string, time: string | undefined, existing: Set<string>) {
  const base = `${date.replaceAll("-", "")}-${(time ?? "00:00").replace(":", "")}`;
  if (!existing.has(base)) return base;
  for (let n = 2; n < 100; n++) if (!existing.has(`${base}-${n}`)) return `${base}-${n}`;
  throw new Error("同一分钟的日志太多");
}

/** 日志照片路径：日期 + 随机串，不依赖日志 key（key 在写入时才最终确定） */
export const logPhotoPath = (date: string, ext: string) =>
  `attachments/logs/${date.replaceAll("-", "")}-${randomId().replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 10)}.${ext}`;

export const MeasureForm = z.object({
  date: isoDate,
  WEIGHT: num(2, 400),
  SBP: num(40, 300),
  DBP: num(20, 200),
  HR: num(20, 250),
  FBG: num(0.5, 40),
});
const MEASURE_UNITS = { WEIGHT: "kg", SBP: "mmHg", DBP: "mmHg", HR: "bpm", FBG: "mmol/L" } as const;

export const manualRecordKey = (date: string) => `${date.replaceAll("-", "")} 日常记录`;

/** 身体数据：同一天合并进一条 manual 记录，同一指标以新值覆盖 */
export function mergeMeasures(prev: RawDoc | undefined, f: z.infer<typeof MeasureForm>): { data: Record<string, unknown>; body: string } | undefined {
  const fresh = (Object.keys(MEASURE_UNITS) as (keyof typeof MEASURE_UNITS)[])
    .filter((k) => f[k] !== undefined)
    .map((code) => ({ code, value: f[code]!, unit: MEASURE_UNITS[code] }));
  if (!fresh.length) return undefined;
  const old = ((prev?.data.indicators as { code: string }[] | undefined) ?? []).filter((r) => !fresh.some((x) => x.code === r.code));
  return {
    data: { date: f.date, type: "manual", title: "日常记录", attachments: [], indicators: [...old, ...fresh] },
    body: prev?.body ?? "",
  };
}

/** 按文件头判断真实图片类型（不信任客户端的 mime）；只收浏览器能直接显示的三种 */
export function sniffImage(buf: Buffer): { ext: "jpg" | "png" | "webp"; mime: string } | undefined {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return undefined;
}
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS = 6;

function clean(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}
