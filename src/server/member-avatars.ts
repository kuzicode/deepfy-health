import { AVATARS, memberAvatars, presetOf, stableAvatar } from "@/avatars";
import type { MemberBundle } from "@/core/schema";
import { getSession } from "./session";

/** 页面用的家人头像表（成员 id → 预设头像 id）：手选的存在档案 avatar 字段；本人默认取当前账号的头像（与 ensureAvatar 的补分配结果一致） */
export async function familyAvatars(members: readonly MemberBundle[]) {
  const session = await getSession();
  const mine = session ? presetOf(session.user.image) ?? stableAvatar(session.user.id, AVATARS) : undefined;
  return memberAvatars(members.map((m) => ({ id: m.id, self: m.profile?.relation === "self", chosen: m.profile?.avatar })), mine);
}
