import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { isSelfHosted } from "@/server/edition";
import { addDays } from "@/core/analysis";
import { cloudMode, getDb } from "@/db/client";
import { masterKey } from "@/server/crypto";
import { todayCN } from "@/server/cn-time";
import { collect, DEFAULT_LEAD, getSetting, LEAD_CHOICES } from "@/server/reminders";
import { requireUser } from "@/server/session";
import { PageHead, SectionHead } from "@/ui/blocks";
import { leadDaysAction, toggleAction } from "./actions";
import { EmailForm } from "./ReminderForms";

// 邮件提醒设置：默认开启；启用 / 暂停、提前天数、收件邮箱（换邮箱须验证码）。
// 预览与每日任务用同一个 collect()，看到的就是会收到的。

type T = Awaited<ReturnType<typeof getTranslations<"app.reminders">>>;

function Status({ t, enabled, to }: { t: T; enabled: boolean; to: string }) {
  const status = enabled ? "on" : "paused";
  const label = enabled ? t("pause") : t("resume");
  return (
    <div className="a-panel a-pad a-remind-status">
      <span className={`a-scope${enabled ? " w" : ""}`}>{t(`status.${status}`)}</span>
      <span className="muted">{enabled ? t("sendingTo", { email: to }) : t("offHint")}</span>
      <form action={toggleAction}>
        <input type="hidden" name="enabled" value={enabled ? "0" : "1"} />
        <button className={`btn ${enabled ? "btn-glass" : "btn-primary"} btn-sm`}>{label}</button>
      </form>
    </div>
  );
}

function LeadForm({ t, lead }: { t: T; lead: number[] }) {
  return (
    <form action={leadDaysAction} className="a-panel a-pad a-form a-remind-lead">
      {LEAD_CHOICES.map((d) => (
        <label key={d} className="a-check"><input type="checkbox" name="lead" value={d} defaultChecked={lead.includes(d)} /> {d === 0 ? t("onDay") : t("daysBefore", { days: d })}</label>
      ))}
      <button className="btn btn-glass btn-sm">{t("save")}</button>
    </form>
  );
}

function Preview({ t, items }: { t: T; items: { who: string; what: string; when: string }[] }) {
  if (!items.length) return <div className="a-panel a-empty">{t("previewEmpty")}</div>;
  return (
    <div className="a-panel a-rows">
      {items.map((x) => (
        <div key={`${x.who}-${x.what}-${x.when}`} className="a-row">
          <span className="main"><span className="title">{x.who} · {x.what}</span></span>
          <span className="when"><span className="mono">{x.when}</span></span>
        </div>
      ))}
    </div>
  );
}

export default async function RemindersPage() {
  if (isSelfHosted()) notFound(); // 这一页是邮件提醒设置，自托管版不发信；首页和成员页的「接下来」照常
  const t = await getTranslations("app.reminders");
  if (!cloudMode()) return <><PageHead eyebrow="" title={t("title")} /><div className="a-panel a-empty">{t("localMode")}</div></>;
  const u = await requireUser();
  const db = getDb();
  const s = await getSetting(db, u.id);
  const lead = s?.leadDays ?? DEFAULT_LEAD;
  const to = s?.email ?? u.email;
  const today = todayCN();
  // 接下来 30 天里会发出的提醒（按当前提前天数）
  const preview = await collect(db, masterKey(), u.id, { leadDays: lead, from: today, to: addDays(today, 30), today, locale: await getLocale() });

  return (
    <>
      <PageHead eyebrow="" title={t("title")} />
      <div className="a-settings">
        <section>
          <p className="muted a-lead">{t("lead")}</p>
          <Status t={t} enabled={s?.enabled ?? true} to={to} />
        </section>
        <section>
          <SectionHead title={t("leadTitle")} />
          <LeadForm t={t} lead={lead} />
        </section>
        <section>
          <SectionHead title={t("emailTitle")} />
          <p className="muted a-lead">{t("emailHint", { login: u.email })}</p>
          <div className="a-panel a-pad"><EmailForm current={to} /></div>
        </section>
        <section>
          <SectionHead title={t("previewTitle")} />
          <p className="muted a-lead">{t("previewHint")}</p>
          <Preview t={t} items={preview} />
        </section>
      </div>
    </>
  );
}
