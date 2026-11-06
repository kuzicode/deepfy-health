"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, LogOut, Mail, MessageSquare, Settings, UserRound } from "lucide-react";
import { SIGNED_IN_COOKIE, avatarUrl } from "@/avatars";
import { useDropdown } from "@/ui/useDropdown";

// 官网导航右侧：未登录「登录 + 进入 App」，已登录「进入 App + 头像」。
// 官网 HTML 由 nginx 缓存、人人相同，首屏一律按未登录渲染；挂载后读父域标记 cookie（App 写入，只含头像 id）再切换。
// 标记只决定这里显示什么，不用于鉴权；过期或残留时点进 App 以真实会话为准。

function readMark(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${SIGNED_IN_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

type Labels = { login: string; enter: string; account: string; settings: string; reminders: string; feedback: string; signOut: string };

/** 已登录：点头像弹出和 App 一样的账号菜单（链到 App 域名下的页面） */
function AccountMenu({ id, app, l }: { id?: string; app: (path: string) => string; l: Labels }) {
  const { open, setOpen, ref } = useDropdown();
  return (
    <div className="s-account" ref={ref}>
      <button type="button" className="s-avatar" aria-label={l.account} aria-expanded={open} onClick={() => setOpen(!open)}>
        {id ? <img src={avatarUrl(id)} alt="" width={34} height={34} /> : <UserRound size={18} />}
      </button>
      {open && (
        <div className="s-menu glass">
          <a href={app("/")}><LayoutGrid size={16} />{l.enter}</a>
          <a href={app("/settings")}><Settings size={16} />{l.settings}</a>
          <a href={app("/reminders")}><Mail size={16} />{l.reminders}</a>
          <a href={app("/feedback")}><MessageSquare size={16} />{l.feedback}</a>
          <hr />
          <a href={app("/logout")}><LogOut size={16} />{l.signOut}</a>
        </div>
      )}
    </div>
  );
}

export function SiteAccount({ appBase, labels: l }: { appBase: string; labels: Labels }) {
  const [mark, setMark] = useState<string | null>(null);
  useEffect(() => setMark(readMark()), []);
  const app = (path: string) => `${appBase}${path}`;

  if (mark === null) {
    return (
      <>
        <a className="s-login" href={app("/login")}>{l.login}</a>
        <a className="btn btn-primary btn-sm" href={app("/")}>{l.enter}</a>
      </>
    );
  }
  const id = /^[\w-]+$/.test(mark) && mark !== "-" ? mark : undefined;
  return (
    <>
      <a className="btn btn-primary btn-sm" href={app("/")}>{l.enter}</a>
      <AccountMenu id={id} app={app} l={l} />
    </>
  );
}
