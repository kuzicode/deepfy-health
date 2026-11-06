import { getLocale, getTranslations } from "next-intl/server";
import { attentionCount } from "@/core/health-template";
import { cloudMode, getDb } from "@/db/client";
import { isAdminEmail } from "@/server/access";
import { ensureAvatar } from "@/server/avatar";
import { familyAvatars } from "@/server/member-avatars";
import { getSession } from "@/server/session";
import { syncUserLocale } from "@/server/user-locale";
import { siteUrl } from "@/site-links";
import { AppShell, type ShellMember } from "@/ui/AppShell";
import { Interactions } from "@/ui/Interactions";
import { getReader } from "@/ui/repo";
import "./app.css";
import "./forms.css";
import { reorderMembersAction } from "./actions";

async function shellMembers(): Promise<ShellMember[]> {
  const s = await (await getReader()).snapshot();
  const avatars = await familyAvatars(s.members);
  return s.members.map((m) => ({ id: m.id, name: m.name, attention: attentionCount(m, s.catalog) ?? 0, avatar: avatars.get(m.id) }));
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = cloudMode() ? await getSession() : null;
  const locale = await getLocale();
  const t = await getTranslations("common");
  // 同步失败不影响页面，邮件继续用上次的语言
  if (session) await syncUserLocale(getDb(), session.user.id, locale).catch((e) => console.error("locale sync failed", e instanceof Error ? e.name : "error"));
  const user = session && {
    name: session.user.name, email: session.user.email, isAdmin: isAdminEmail(session.user.email) && session.user.emailVerified,
    avatar: await ensureAvatar(getDb(), session.user),
  };
  return (
    <div className="a-root" lang={locale}>
      <Interactions />
      <AppShell siteHref={siteUrl(locale)} members={await shellMembers()} user={user || undefined} reorderMembers={reorderMembersAction}>
        <main className="a-main">{children}</main>
        <footer className="a-foot">{t("disclaimer")}</footer>
      </AppShell>
    </div>
  );
}
