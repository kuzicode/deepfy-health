"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, Bot, ChevronDown, LogOut, Mail, MessageSquare, Settings, ShieldCheck, Users } from "lucide-react";
import { avatarSrc, avatarUrl } from "@/avatars";
import { authClient } from "@/client/auth-client";
import { clearSignedInMark, setSignedInMark } from "@/client/signed-in-mark";
import { Avatar } from "./Avatar";
import { LocaleToggle } from "./LocaleToggle";
import { Logo, Wordmark } from "./Logo";
import { useDropdown } from "./useDropdown";

export interface ShellMember { id: string; name: string; attention: number; avatar?: string }
/** avatar：预设头像 id（没有时显示首字母） */
export interface ShellUser { name: string; email: string; isAdmin?: boolean; avatar?: string }


/** 右上角的独立入口：Agent 接入、邮件提醒 */
const TOP_LINKS = [["/agents", "agents", Bot]] as const;


/** 右上角账号头像与菜单；挂载时写官网登录态标记，退出时清掉 */
function AccountMenu({ user, path }: { user: ShellUser; path: string }) {
  const t = useTranslations("app.nav");
  const menu = useDropdown();
  const close = menu.setOpen;
  useEffect(() => { close(false); }, [path, close]);
  useEffect(() => { setSignedInMark(user.avatar); }, [user.avatar]);
  return (
    <div className="a-account" ref={menu.ref}>
      <button type="button" onClick={() => menu.setOpen(!menu.open)} aria-label={user.email}>
        <Avatar id={user.email} name={user.name || user.email} size={34} src={user.avatar ? avatarUrl(user.avatar) : undefined} />
      </button>
      {menu.open && (
        <div className="a-menu glass" style={{ background: "var(--glass-strong)" }}>
          <div className="who">{user.email}</div>
          <Link href="/settings"><Settings size={16} />{t("settings")}</Link>
          <Link href="/reminders"><Mail size={16} />{t("reminders")}</Link>
          <Link href={`/feedback?from=${encodeURIComponent(path)}`}><MessageSquare size={16} />{t("feedback")}</Link>
          {user.isAdmin && <Link href="/admin"><ShieldCheck size={16} />{t("admin")}</Link>}
          <button type="button" onClick={async () => { await authClient.signOut(); clearSignedInMark(); window.location.assign("/login"); }}>
            <LogOut size={16} />{t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ members, user, siteHref, children }: { members: ShellMember[]; user?: ShellUser; siteHref: string; children: React.ReactNode }) {
  const t = useTranslations("app.nav");
  const path = usePathname();
  const currentId = decodeURIComponent(path.match(/^\/m\/([^/]+)/)?.[1] ?? "");
  const current = members.find((m) => m.id === currentId);
  const memberMenu = useDropdown();
  const closeMember = memberMenu.setOpen;
  useEffect(() => { closeMember(false); }, [path, closeMember]);

  const tabs = current ? [
    [`/m/${current.id}`, t("overview")], [`/m/${current.id}/browse`, t("indicators")], [`/m/${current.id}/records`, t("records")],
    [`/m/${current.id}/regimen`, t("regimen")], [`/m/${current.id}/profile`, t("profile")],
  ] : [];
  const tabOn = (href: string) => path === href || (href.endsWith("/browse") && path.includes("/indicators/"));

  return (
    <>
      <header className="a-bar">
        <div className="a-bar-inner glass">
          {/* 「家庭」已经回到 App 首页，logo 指向官网 */}
          <a href={siteHref} aria-label="Deepfy" className="logo"><span className="logo-full"><Wordmark size={20} /></span><span className="logo-mark"><Logo size={22} /></span></a>
          <div className="a-member" ref={memberMenu.ref}>
            <button type="button" onClick={() => memberMenu.setOpen(!memberMenu.open)} aria-expanded={memberMenu.open}>
              {current ? <Avatar id={current.id} name={current.name} size={26} src={avatarSrc(current.avatar)} /> : <Users size={16} style={{ marginLeft: 6 }} />}
              <span>{current?.name ?? t("family")}</span>
              <ChevronDown size={14} />
            </button>
            {memberMenu.open && (
              <div className="a-menu glass" style={{ background: "var(--glass-strong)" }}>
                <Link href="/" className={path === "/" ? "on" : ""}><Users size={16} />{t("family")}</Link>
                <hr />
                {members.map((m) => (
                  <Link key={m.id} href={`/m/${m.id}`} className={m.id === currentId ? "on" : ""}>
                    <Avatar id={m.id} name={m.name} size={22} src={avatarSrc(m.avatar)} />{m.name}{m.attention > 0 && <span className="count">{m.attention}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {tabs.length > 0 && (
            <nav className="a-tabs">
              {tabs.map(([href, label]) => <Link key={href} href={href} className={tabOn(href) ? "on" : ""}>{label}</Link>)}
            </nav>
          )}
          <div className="a-bar-right">
            {user && TOP_LINKS.map(([href, key, Icon]) => (
              <Link key={href} href={href} className={`a-agents${path === href ? " on" : ""}`} aria-label={t(key)}>
                <Icon size={16} /><span>{t(key)}</span>
              </Link>
            ))}
            <a href={`${siteHref}/docs`} className="a-agents" aria-label={t("docs")}><BookOpen size={16} /><span>{t("docs")}</span></a>
            <LocaleToggle />
            {user && (
              <AccountMenu user={user} path={path} />
            )}
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
