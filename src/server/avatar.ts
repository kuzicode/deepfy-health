import { eq } from "drizzle-orm";
import { AVATARS, presetOf, presetValue, randomAvatar, stableAvatar } from "@/avatars";
import type { DB } from "@/db/client";
import { user } from "@/db/schema";

// 账号头像（预设头像）。user.image 存 "preset:<id>"；Google 注册带来的头像 URL 也会被替换，页面不请求第三方图片。

/** 注册时随机分配；清单为空时什么都不做（之后进入 App 时再按 userId 补分配） */
export async function assignAvatarOnSignup(db: DB, userId: string, list: readonly string[] = AVATARS) {
  const id = randomAvatar(list);
  if (id) await db.update(user).set({ image: presetValue(id) }).where(eq(user.id, userId));
}

/**
 * 当前账号应显示的头像 id：已有有效预设头像直接用；否则（老账号、清单为空期间注册、头像已下线）按 userId 稳定挑一个并补写（只在还不是有效预设时写）。
 * 清单为空返回 undefined（显示首字母头像）。
 */
export async function ensureAvatar(db: DB, u: { id: string; image?: string | null }, list: readonly string[] = AVATARS): Promise<string | undefined> {
  const have = presetOf(u.image, list);
  if (have) return have;
  const id = stableAvatar(u.id, list);
  if (!id) return undefined;
  // 同一 userId 挑出的结果固定，并发两次进入写入的内容相同
  await db.update(user).set({ image: presetValue(id) }).where(eq(user.id, u.id));
  return id;
}

/** 设置页换头像：只接受清单里的 id */
export async function setAvatar(db: DB, userId: string, id: string, list: readonly string[] = AVATARS) {
  if (!list.includes(id)) throw new Error("unknown avatar");
  await db.update(user).set({ image: presetValue(id) }).where(eq(user.id, userId));
}
