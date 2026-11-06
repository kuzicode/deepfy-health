import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { abnormalReadings, ageOn, bmi, lastCheckup, reminders, todayISO } from "@/core/analysis";
import { attentionCount } from "@/core/health-template";
import { avatarSrc, suggestAvatar } from "@/avatars";
import { familyAvatars } from "@/server/member-avatars";
import { Avatar } from "@/ui/Avatar";
import type { Catalog, MemberBundle } from "@/core/schema";
import { PageHead, ReminderRows, SectionHead } from "@/ui/blocks";
import { indicatorName } from "@/ui/i18n";
import { cloudMode } from "@/db/client";
import { NewMemberForm } from "@/ui/forms/NewMemberForm";
import { getReader } from "@/ui/repo";
import { Sortable } from "@/ui/Sortable";
import { createMemberAction, reorderMembersAction } from "./actions";

type T = Awaited<ReturnType<typeof getTranslations<"app">>>;

/** 家庭页的一张成员卡片：头像、关系年龄、需关注 / 上次体检 / 提醒、异常指标 */
function MemberCard({ m, catalog, avatar, today, t, locale }: { m: MemberBundle; catalog: Catalog; avatar?: string; today: string; t: T; locale: string }) {
  const abnormal = abnormalReadings(m, catalog);
  const attention = attentionCount(m, catalog);
  const b = bmi(m.profile);
  return (
    <Link href={`/m/${m.id}`} className="a-panel a-member-card spotlight reveal">
      <div className="top">
        <Avatar id={m.id} name={m.name} size={46} src={avatarSrc(avatar)} />
        <div>
          <h3>{m.name}</h3>
          {m.profile && (
            <div className="meta">
              {[
                m.profile.relation && m.profile.relation !== "other" && t(`relation.${m.profile.relation}`),
                t(m.profile.birth_estimated ? "member.approxAge" : "member.ageLine", { age: ageOn(m.profile.birth_date, today) }),
                t(`profile.${m.profile.sex}`), b && `BMI ${b}`,
              ].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>
      <div className="nums">
        <div><span className="label">{t("home.attention")}</span><b style={attention ? { color: "var(--high)" } : undefined}>{attention ?? "—"}</b></div>
        <div><span className="label">{t("home.lastCheckup")}</span><b className="date">{lastCheckup(m) ?? t("home.none")}</b></div>
        <div><span className="label">{t("home.reminders")}</span><b>{reminders(m, today).length}</b></div>
      </div>
      <div className="chips">
        {m.records.length === 0 && <span className="chip chip-unknown">{t("home.noRecords")}</span>}
        {abnormal.slice(0, 6).map((r) => <span key={r.code} className={`chip chip-${r.flag}`}>{indicatorName(catalog.get(r.code), r.name, locale)}</span>)}
      </div>
    </Link>
  );
}

/** 云端模式可以拖动排序；本地 vault 模式顺序由 family.yaml 决定 */
function MemberGrid({ items, label }: { items: { id: string; node: React.ReactNode }[]; label: string }) {
  if (cloudMode()) return <Sortable className="a-grid" itemClassName="a-card-item" save={reorderMembersAction} label={label} items={items} />;
  return <div className="a-grid">{items.map((x) => <div key={x.id} className="a-card-item">{x.node}</div>)}</div>;
}

export default async function Home() {
  const s = await (await getReader()).snapshot();
  const t = await getTranslations("app");
  const locale = await getLocale();
  const today = todayISO();
  const names = new Map(s.members.map((m) => [m.id, m.name]));
  const all = s.members.flatMap((m) => reminders(m, today)).sort((a, b) => a.due.localeCompare(b.due));
  const errors = s.issues.filter((i) => i.level === "error").length;
  const avatars = await familyAvatars(s.members);
  const suggested = cloudMode() ? suggestAvatar(avatars.values()) : undefined;

  return (
    <>
      <PageHead eyebrow={t("home.eyebrow")} title={s.family.family ? t("home.title", { family: s.family.family }) : t("home.titleDefault")} />

      {s.issues.length > 0 && (
        <details className={`a-issues${errors ? " err" : ""}`}>
          <summary>{t("home.issues", { errors, warnings: s.issues.length - errors })}</summary>
          <ul>{s.issues.map((i, n) => <li key={n}><code>{i.file}</code> {i.message}</li>)}</ul>
        </details>
      )}

      {s.members.length === 0 ? (
        cloudMode() ? (
          <div className="a-panel a-pad a-onboard">
            <h2>{t("newMember.title")}</h2>
            <p className="muted">{t("newMember.sub")}</p>
            <NewMemberForm action={createMemberAction} today={today} suggested={suggested} />
            <p className="muted small">{t("home.emptyHint")} <Link href="/settings" style={{ color: "var(--brand)" }}>{t("home.toSettings")} →</Link></p>
          </div>
        ) : (
          <div className="a-panel a-empty"><p><b>{t("home.empty")}</b></p></div>
        )
      ) : (
        <MemberGrid items={s.members.map((m) => ({ id: m.id, node: <MemberCard m={m} catalog={s.catalog} avatar={avatars.get(m.id)} today={today} t={t} locale={locale} /> }))} label={t("nav.reorder")} />
      )}

      {s.members.length > 0 && cloudMode() && (
        <details className="a-add-member">
          <summary>+ {t("newMember.addTitle")}</summary>
          <div className="a-panel a-pad"><NewMemberForm action={createMemberAction} today={today} compact suggested={suggested} /></div>
        </details>
      )}

      {all.length > 0 && (
        <section className="a-section">
          <SectionHead title={t("home.remindersTitle")} />
          <ReminderRows items={all} names={names} />
        </section>
      )}
    </>
  );
}
