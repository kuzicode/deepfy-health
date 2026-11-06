import { and, eq, isNull, ne, or } from "drizzle-orm";
import type { DB } from "@/db/client";
import { user } from "@/db/schema";
import { toLocale, type Locale } from "@/i18n/config";

/** 把当前界面语言记到账号上（定时提醒没有请求可看，只能读这里）。语言没变不写，返回是否写入 */
export async function syncUserLocale(db: DB, userId: string, locale: Locale): Promise<boolean> {
  const rows = await db.update(user).set({ locale })
    .where(and(eq(user.id, userId), or(isNull(user.locale), ne(user.locale, locale))))
    .returning({ id: user.id });
  return rows.length > 0;
}

/** 账号保存的语言；没有记录时返回 undefined，由调用方决定怎么兜底 */
export async function storedLocale(db: DB, userId: string): Promise<Locale | undefined> {
  const [row] = await db.select({ locale: user.locale }).from(user).where(eq(user.id, userId));
  return row?.locale ? toLocale(row.locale) : undefined;
}
