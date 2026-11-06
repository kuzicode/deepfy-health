import { z } from "zod";
import type { RegimenPatch } from "@/mcp/regimen-write";

// 用药页表单 → 条目 patch（纯函数，便于单测）。空字符串表示清空字段（null），身份只来自 session（SEC6）

const opt = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optDate = z.union([z.literal("").transform(() => null), day]);
const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const Fields = z.object({
  kind: z.enum(["medication", "supplement"]),
  name: z.string().trim().min(1).max(80),
  dose: z.string().trim().min(1).max(60),
  source: z.enum(["prescribed", "self", "agent"]),
  prescriber: opt(100), frequency: opt(60), reason: opt(200), brand: opt(80), spec: opt(120),
  start: day, end: optDate, expiry: optDate,
  meal: z.enum(["", "food", "fasting"]),
  times: z.string().max(100),
  precautions: z.string().max(2200),
});

export function parseRegimenForm(form: FormData): RegimenPatch | undefined {
  const r = Fields.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!r.success) return undefined;
  const { meal, times: timesText, precautions: lines, ...f } = r.data;
  const times = timesText.split(/[\s,，、;；]+/).filter(Boolean).map((t) => t.padStart(5, "0"));
  if (times.length > 8 || !times.every((t) => TIME.test(t))) return undefined;
  const precautions = lines.split("\n").map((l) => l.trim().slice(0, 200)).filter(Boolean).slice(0, 10);
  const days = WEEK.filter((d) => form.getAll("days").includes(d));
  return {
    ...f, times,
    as_needed: form.get("as_needed") === "on",
    with_food: meal === "" ? null : meal === "food",
    days: days.length ? days : null,
    precautions: precautions.length ? precautions : null,
    related: form.getAll("related").map(String).filter((c) => /^[A-Z0-9_]{1,40}$/.test(c)).slice(0, 20),
  };
}

/** 采纳建议：不带 end 表示原来就没有结束日期；空字符串表示这次确认不设结束日期 */
export const AdoptForm = z.object({ end: optDate.optional() });

export const StopForm = z.object({ stopped_on: day, stop_reason: z.string().trim().max(200).optional() });
