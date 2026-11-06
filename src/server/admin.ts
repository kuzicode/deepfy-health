import { desc, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { allowedEmail } from "@/db/schema";
import { adminEmails } from "./access";

// 管理后台的数据：只有账号元数据与数量。不解密、不返回任何健康内容（成员姓名也是密文，只统计数量）

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  createdAt: string;
  lastSeen: string | null;
  providers: string;
  members: number;
  docs: number;
  attachmentBytes: number;
  tokens: number;
  plan: string;
  disabledAt: string | null;
  isAdmin: boolean;
}

export async function listUsers(db: DB): Promise<AdminUserRow[]> {
  const rows = await db.execute<Omit<AdminUserRow, "isAdmin">>(sql`
    select u.id, u.email, u.name, u.email_verified as verified,
      u.created_at as "createdAt",
      (select max(s.updated_at) from session s where s.user_id = u.id) as "lastSeen",
      coalesce((select string_agg(distinct a.provider_id, ', ') from account a where a.user_id = u.id), '') as providers,
      (select count(*)::int from member m where m.user_id = u.id) as members,
      (select count(*)::int from doc d join member m on m.id = d.member_id where m.user_id = u.id) as docs,
      (select coalesce(sum(at.size), 0)::bigint from attachment at join member m on m.id = at.member_id where m.user_id = u.id) as "attachmentBytes",
      (select count(*)::int from api_token t where t.user_id = u.id) as tokens,
      coalesce(ap.plan, 'free') as plan,
      us.disabled_at as "disabledAt"
    from "user" u left join user_status us on us.user_id = u.id left join account_plan ap on ap.user_id = u.id
    order by u.created_at desc`);
  const admins = adminEmails();
  return [...rows].map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt).toISOString(),
    lastSeen: r.lastSeen ? new Date(r.lastSeen).toISOString() : null,
    disabledAt: r.disabledAt ? new Date(r.disabledAt).toISOString() : null,
    attachmentBytes: Number(r.attachmentBytes),
    isAdmin: admins.includes(r.email.toLowerCase()),
  }));
}

export async function adminStats(db: DB) {
  const [row] = await db.execute<{ users: number; active7d: number; members: number; docs: number; bytes: number }>(sql`
    select (select count(*)::int from "user") as users,
      (select count(distinct user_id)::int from session where updated_at > now() - interval '7 days') as "active7d",
      (select count(*)::int from member) as members,
      (select count(*)::int from doc) as docs,
      (select coalesce(sum(size), 0)::bigint from attachment) as bytes`);
  return { ...row, bytes: Number(row.bytes) };
}

export const listAllowed = (db: DB) => db.select().from(allowedEmail).orderBy(desc(allowedEmail.createdAt));

export const envAllowed = () => (process.env.KZ_ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
