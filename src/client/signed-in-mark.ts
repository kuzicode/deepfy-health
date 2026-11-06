"use client";

import { useEffect } from "react";
import { SIGNED_IN_COOKIE, parentCookieDomain } from "@/avatars";

// 官网登录态标记（父域 cookie，只含头像 id）：进入 App 时写入、续期 30 天；任何退出路径都要清掉。
// 只决定官网右上角显示什么，不用于鉴权。父域按当前地址推出（app.deepfy.si → .deepfy.si；localhost 不写 Domain）。

function write(value: string | null) {
  const domain = parentCookieDomain(location.origin);
  const attrs = `; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}${domain ? `; Domain=${domain}` : ""}`;
  document.cookie = value === null
    ? `${SIGNED_IN_COOKIE}=${attrs}; Max-Age=0`
    : `${SIGNED_IN_COOKIE}=${encodeURIComponent(value)}${attrs}; Max-Age=${30 * 86400}`;
}

export const setSignedInMark = (avatar: string | undefined) => write(avatar ?? "-");
export const clearSignedInMark = () => write(null);

/** 放在登录页：能看到登录页就说明没有会话（退出、注销账号、会话过期最后都会到这里），顺手清掉残留标记 */
export function ClearSignedInMark() {
  useEffect(() => clearSignedInMark(), []);
  return null;
}
