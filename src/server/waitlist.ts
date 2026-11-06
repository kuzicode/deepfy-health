import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import { waitlist } from "@/db/schema";
import { addAllowedEmail, normalizeEmail } from "./access";
import { lookupEmail, type LookupNext } from "./login-lookup";

// 早鸟申请（候补名单）：前台申请 → 后台审批 → 通过即加入已开通名单并发邀请邮件。
// 接口不透露是否已申请过；邮箱已开通时告知去登录，和 login-lookup 暴露的信息相同（已知取舍，同样按 IP 限速）。

const AGENT_CHOICES = ["claude-code", "codex", "gemini-cli", "grokbot", "workbuddy", "hermes-agent", "other"] as const;

export const WaitlistInput = z.object({
  email: z.email().max(254),
  agents: z.array(z.enum(AGENT_CHOICES)).max(AGENT_CHOICES.length).default([]),
  note: z.string().trim().max(200).optional(),
  locale: z.enum(["zh", "en"]).optional(),
  source: z.enum(["login", "site"]).default("login"),
});
export type WaitlistInput = z.input<typeof WaitlistInput>;

/** 重复申请只更新填写内容，不改审批状态 */
export async function joinWaitlist(db: DB, input: WaitlistInput) {
  const v = WaitlistInput.parse(input);
  const row = { email: normalizeEmail(v.email), agents: [...new Set(v.agents)], note: v.note || null, locale: v.locale ?? null, source: v.source };
  await db.insert(waitlist).values(row).onConflictDoUpdate({
    target: waitlist.email,
    set: { agents: row.agents, note: row.note, locale: row.locale },
  });
}

/** 申请入口：已开通或已有账号的邮箱不进候补，返回下一步；closed 表示已记入候补 */
export async function applyForAccess(db: DB, input: WaitlistInput): Promise<LookupNext> {
  const v = WaitlistInput.parse(input);
  const next = await lookupEmail(db, v.email);
  if (next === "closed") await joinWaitlist(db, input);
  return next;
}

export const listWaitlist = (db: DB, status?: string) =>
  db.select().from(waitlist).where(status ? eq(waitlist.status, status) : undefined).orderBy(desc(waitlist.createdAt)).limit(500);

export async function waitlistStats(db: DB) {
  const [row] = await db.execute<{ total: number; pending: number; approved: number; declined: number; week: number }>(sql`
    select count(*)::int as total,
      count(*) filter (where status = 'pending')::int as pending,
      count(*) filter (where status = 'approved')::int as approved,
      count(*) filter (where status = 'declined')::int as declined,
      count(*) filter (where created_at > now() - interval '7 days')::int as week
    from waitlist`);
  const agents = await db.execute<{ agent: string; n: number }>(sql`
    select a as agent, count(*)::int as n from waitlist, unnest(agents) as a group by a order by n desc`);
  return { ...row, agents: [...agents] };
}

/** 审批：通过 → 写入已开通名单；返回需要发邀请邮件的申请（拒绝或不存在返回 undefined） */
export async function decide(db: DB, email: string, approve: boolean, by: string) {
  const e = normalizeEmail(email);
  const [row] = await db.update(waitlist)
    .set({ status: approve ? "approved" : "declined", decidedAt: new Date(), decidedBy: by })
    .where(eq(waitlist.email, e)).returning();
  if (!row || !approve) return undefined;
  await addAllowedEmail(db, e, "waitlist", by);
  return row;
}
