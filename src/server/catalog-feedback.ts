import { desc, sql } from "drizzle-orm";
import { z } from "zod";
import { normName } from "@/core/names";
import type { DB } from "@/db/client";
import { catalogFeedback } from "@/db/schema";

// 字典缺口反馈：用户主动提交「其他项目」的名称，用于维护内置字典。
// 只存名称 / 单位 / 分组与计数——不存用户、数值、日期（SEC5：管理员只看聚合数据）。

const MAX_FEEDBACK_ITEMS = 50;

export const FeedbackItems = z.array(z.object({
  name: z.string().trim().min(1).max(80),
  unit: z.string().trim().max(30).optional(),
  section: z.string().trim().max(30).optional(),
})).min(1).max(MAX_FEEDBACK_ITEMS);

/** 同名（归一化后）只计一次，避免同一份报告里的重复项把计数撑大 */
export function dedupe(items: z.infer<typeof FeedbackItems>) {
  const seen = new Map<string, (typeof items)[number]>();
  for (const it of items) {
    const key = normName(it.name);
    if (key && !seen.has(key)) seen.set(key, it);
  }
  return [...seen.entries()];
}

/** 时间只记到月：降低「某个罕见项目名 ↔ 某个用户的活动时间」被对上的可能 */
const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

export async function submitFeedback(db: DB, input: unknown) {
  const rows = dedupe(FeedbackItems.parse(input)); // trim / 长度 / 条数在这里统一校验
  const month = monthStart();
  // 一条多行 upsert：一次往返、要么全成功要么全失败（重试不会重复计数一部分）
  await db.insert(catalogFeedback)
    .values(rows.map(([nameNorm, it]) => ({ nameNorm, name: it.name, unit: it.unit || null, section: it.section || null, firstSeen: month, lastSeen: month })))
    .onConflictDoUpdate({ target: catalogFeedback.nameNorm, set: { count: sql`${catalogFeedback.count} + 1`, lastSeen: month } });
  return rows.length;
}

export const listFeedback = (db: DB, limit = 200) =>
  db.select().from(catalogFeedback).orderBy(desc(catalogFeedback.count), desc(catalogFeedback.lastSeen)).limit(limit);
