import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { cloudMode, getDb } from "@/db/client";
import { account } from "@/db/schema";
import { isUnlimited, limitsOf, usageOf } from "@/server/quota";
import { requireUser } from "@/server/session";
import { AVATARS, avatarUrl, presetOf } from "@/avatars";
import { PageHead, SectionHead } from "@/ui/blocks";
import { setAvatarAction } from "./actions";
import { isSelfHosted } from "@/server/edition";
import { ChangePasswordForm, DeleteAccountForm, PasswordForm, SignOutButton, SignOutOthersButton } from "./SettingsForms";

export default async function SettingsPage() {
  const t = await getTranslations("app.settings");
  if (!cloudMode()) return <><PageHead eyebrow={t("eyebrow")} title={t("title")} /><div className="a-panel a-empty">{t("localMode")}</div></>;
  const u = await requireUser();
  const nav = await getTranslations("app.nav");
  const cred = await getDb().query.account.findFirst({ where: and(eq(account.userId, u.id), eq(account.providerId, "credential")) });
  const [limits, used] = await Promise.all([limitsOf(getDb(), u.id), usageOf(getDb(), u.id)]);
  const mb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(0)} GB` : `${(b / 1048576).toFixed(b < 10 * 1048576 ? 1 : 0)} MB`);
  const of = (used: number, limit: number, fmt: (n: number) => string = String): [string, number] =>
    [`${fmt(used)} / ${isUnlimited(limit) ? t("usage.unlimited") : fmt(limit)}`, used / limit];
  const usage: [string, ...[string, number]][] = [
    [t("usage.members"), ...of(used.members, limits.members)],
    [t("usage.attachments"), ...of(used.attachmentBytes, limits.attachmentBytes, mb)],
    [t("usage.tokens"), ...of(used.tokens, limits.tokens)],
    [t("usage.writes"), ...of(used.mcpWritesPerDay, limits.mcpWritesPerDay)],
  ];

  return (
    <>
      <PageHead eyebrow={t("eyebrow")} title={t("title")} sub={u.email} />
      <div className="a-settings">
        <section>
          <SectionHead title={t("account")} />
          <div className="a-panel a-rows">
            <div className="a-row">
              <span className="main"><span className="title">{u.name}</span><span className="detail" style={{ display: "block" }}>{u.email}</span></span>
              <SignOutOthersButton />
              <SignOutButton label={nav("signOut")} />
            </div>
            {/* 有密码：凭当前密码修改；官方版另外可以用邮箱验证码重置或设置密码（只用 Google 或验证码登录的账号）。自托管不发信，忘记密码找管理员 */}
            {cred?.password && <div className="a-row a-row-block"><ChangePasswordForm /></div>}
            {!isSelfHosted() && <div className="a-row a-row-block"><PasswordForm email={u.email} hasPassword={!!cred?.password} resetOnly={!!cred?.password} /></div>}
          </div>
        </section>

        {AVATARS.length > 0 && (
          <section>
            <SectionHead title={t("avatar")} />
            <div className="a-panel a-pad">
              <div className="avatar-grid">
                {AVATARS.map((id) => (
                  <form key={id} action={setAvatarAction}>
                    <input type="hidden" name="avatar" value={id} />
                    <button className={presetOf(u.image) === id ? "on" : ""} aria-label={id} aria-pressed={presetOf(u.image) === id}><img src={avatarUrl(id)} alt="" width={56} height={56} /></button>
                  </form>
                ))}
              </div>
            </div>
          </section>
        )}

        <section>
          <SectionHead title={t("usage.title")} />
          <p className="muted a-lead">{t(isUnlimited(limits.members) ? "usage.adminHint" : "usage.hint")}</p>
          <div className="a-panel a-rows">
            {usage.map(([label, value, ratio]) => (
              <div className="a-row" key={label}>
                <span className="main"><span className="title">{label}</span></span>
                <span className={`chip ${ratio >= 1 ? "chip-H" : ratio >= 0.8 ? "chip-warn" : "chip-mint"}`}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHead title={t("security")} />
          <div className="a-panel a-pad">
            <p style={{ margin: "0 0 14px", lineHeight: 1.7 }}>{t("securityText")}</p>
            <a className="btn btn-glass btn-sm" href="/settings/export">{t("export")}</a>
          </div>
        </section>

        <section>
          <SectionHead title={t("delete")} />
          <div className="a-panel a-pad"><DeleteAccountForm email={u.email} /></div>
        </section>
      </div>
    </>
  );
}
