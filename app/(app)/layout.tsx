import { getLocale } from "next-intl/server";
import { memberAvatars } from "@/avatars";
import { cloudMode, getDb } from "@/db/client";
import { isAdmin } from "@/server/access";
import { ensureAvatar } from "@/server/avatar";
import { getSession } from "@/server/session";
import { syncUserLocale } from "@/server/user-locale";
import { isSelfHosted } from "@/server/edition";
import { docsUrl, homeUrl } from "@/site-links";
import { AppShell, type ShellMember } from "@/ui/AppShell";
import { Interactions } from "@/ui/Interactions";
import { getReader } from "@/ui/repo";
import "./app.css";
import "./forms.css";
import { reorderMembersAction } from "./actions";

async function shellMembers(): Promise<ShellMember[]> {
  const members = await (await getReader()).listMemberStubs();
  const avatars = memberAvatars(members);
  return members.map(({ id, name }) => ({ id, name, avatar: avatars.get(id) }));
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = cloudMode() ? await getSession() : null;
  const locale = await getLocale();
  // 同步失败不影响页面，邮件继续用上次的语言
  if (session) await syncUserLocale(getDb(), session.user.id, locale).catch((e) => console.error("locale sync failed", e instanceof Error ? e.name : "error"));
  const user = session && {
    name: session.user.name, email: session.user.email, isAdmin: await isAdmin(getDb(), session.user),
    avatar: await ensureAvatar(getDb(), session.user),
  };
  return (
    <div className="a-root" lang={locale}>
      <Interactions />
      <AppShell homeHref={homeUrl(locale)} docsHref={docsUrl(locale)} selfHosted={isSelfHosted()} members={await shellMembers()} user={user || undefined} reorderMembers={reorderMembersAction}>
        <main className="a-main">{children}</main>
      </AppShell>
    </div>
  );
}
