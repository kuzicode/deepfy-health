// 预设头像：注册时随机分配一个，存在 user.image = "preset:<id>"；设置页可换。
// 图片放在 public/avatars/<id>.<AVATAR_EXT>，在这里登记 id 即可生效。清单为空时一律显示首字母头像。
// 现有一套「暖柔健康」：DiceBear Thumbs（CC0），奶油 / 杏 / 陶土 / 雾蓝配色，不分性别；自托管，不调用 DiceBear 接口（不把 userId 发给第三方）。
// 追加新头像时只往后加 id，不要改已有 id 对应的图（老用户的头像会跟着变）。

export const AVATARS: readonly string[] = Array.from({ length: 18 }, (_, i) => `t${String(i + 1).padStart(2, "0")}`);
const AVATAR_EXT = "svg";
const PREFIX = "preset:";

export const avatarUrl = (id: string) => `/avatars/${id}.${AVATAR_EXT}`;
/** 可能没有头像时用：没有返回 undefined（显示首字母） */
export const avatarSrc = (id: string | undefined) => (id ? avatarUrl(id) : undefined);
export const presetValue = (id: string) => `${PREFIX}${id}`;

/** user.image 里的预设头像 id；不是预设头像（空、Google 头像 URL、已下线的 id）返回 undefined */
export function presetOf(image: string | null | undefined, list: readonly string[] = AVATARS): string | undefined {
  if (!image?.startsWith(PREFIX)) return undefined;
  const id = image.slice(PREFIX.length);
  return list.includes(id) ? id : undefined;
}

/** 随机挑一个（注册时用）；清单为空返回 undefined */
export function randomAvatar(list: readonly string[] = AVATARS, rand = Math.random): string | undefined {
  return list.length ? list[Math.floor(rand() * list.length)] : undefined;
}

/** 按 userId 稳定地挑一个（老账号补分配）；清单为空返回 undefined */
export function stableAvatar(userId: string, list: readonly string[] = AVATARS): string | undefined {
  if (!list.length) return undefined;
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.codePointAt(0)!) | 0;
  return list[Math.abs(h) % list.length];
}

/**
 * 家人头像（成员 id → 预设头像 id）。优先级：网页上手动选的（chosen）→「本人」用账号头像 →
 * 其余按成员 id 稳定挑一个，和已占用的（手选的、账号头像、前面分配的）重复时顺延到下一个没用过的。
 * 自动分配不存库，老成员自动有头像；手选的允许和别人重复（用户的选择为准）。
 */
export function memberAvatars(members: readonly { id: string; self?: boolean; chosen?: string }[], mine?: string, list: readonly string[] = AVATARS): Map<string, string> {
  const out = new Map<string, string>();
  if (!list.length) return out;
  const used = new Set<string>();
  const take = (id: string, a: string) => { out.set(id, a); used.add(a); };
  for (const m of members.filter((x) => x.chosen && list.includes(x.chosen))) take(m.id, m.chosen!);
  if (mine && list.includes(mine)) {
    used.add(mine); // 账号头像只给本人，没建「本人」档案时也不分给家人，免得和右上角撞
    const me = members.find((m) => m.self && !out.has(m.id));
    if (me) take(me.id, mine);
  }
  for (const m of members) {
    if (out.has(m.id)) continue;
    take(m.id, nextFree(stableAvatar(m.id, list)!, used, list));
  }
  return out;
}

/** 从 start 开始顺延，第一个没被占用的；全占满了就用 start */
function nextFree(start: string, used: ReadonlySet<string>, list: readonly string[]) {
  const i = list.indexOf(start);
  return list.map((_, k) => list[(i + k) % list.length]).find((a) => !used.has(a)) ?? start;
}

/** 建档时默认选中的头像：随机挑一个家里还没人用的（都用过了就随便挑）；清单为空返回 undefined */
export function suggestAvatar(used: Iterable<string>, list: readonly string[] = AVATARS, rand = Math.random): string | undefined {
  const taken = new Set(used);
  const free = list.filter((a) => !taken.has(a));
  return randomAvatar(free.length ? free : list, rand);
}

/** 官网登录态标记 cookie：只含头像 id（或 "-"），不含身份信息；只决定官网右上角显示什么，不用于鉴权 */
export const SIGNED_IN_COOKIE = "dfy_av";

/** 标记 cookie 的父域：https://app.deepfy.si → .deepfy.si；localhost / IP → 不写 Domain（官网预览与 App 同源） */
export function parentCookieDomain(appUrl: string | undefined): string | undefined {
  if (!appUrl) return undefined;
  let host: string;
  try {
    host = new URL(appUrl).hostname;
  } catch {
    return undefined;
  }
  if (host === "localhost" || /^[\d.]+$/.test(host) || host.startsWith("[")) return undefined;
  const parts = host.split(".");
  return parts.length >= 3 ? `.${parts.slice(1).join(".")}` : `.${host}`;
}
