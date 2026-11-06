import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { adminEmails, registrationRestricted } from "@/server/access";
import { adminStats, envAllowed, listAllowed, listUsers } from "@/server/admin";
import { listFeedback } from "@/server/catalog-feedback";
import { listRecentFeedback } from "@/server/feedback";
import { PLANS } from "@/server/quota";
import { requireAdmin } from "@/server/session";
import { PageHead, SectionHead } from "@/ui/blocks";
import { removeAllowedAction, setDisabledAction } from "./actions";
import { AllowForm } from "./AllowForm";
import { FeedbackSection } from "./FeedbackSection";
import { GapsSection } from "./GapsSection";
import { WAITLIST_STATUS, WaitlistSection } from "./WaitlistSection";

export const metadata = { title: "Admin", robots: { index: false } };

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
const size = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** 已开通邮箱：管理员、环境变量、后台添加（含审批通过）三个来源 */
async function AllowedSection({ t }: { t: Awaited<ReturnType<typeof getTranslations<"admin">>> }) {
  const allowed = await listAllowed(getDb());
  const env = envAllowed();
  return (
    <section className="a-section">
      <SectionHead title={t("allow.title")} />
      <p className="muted" style={{ margin: "-6px 0 12px", fontSize: 13.5 }}>{t("allow.hint")}</p>
      <div className="a-panel a-rows">
        {adminEmails().map((e) => <div className="a-row" key={`a-${e}`}><span className="main"><span className="title">{e}</span></span><span className="chip chip-mint">{t("allow.adminTag")}</span></div>)}
        {env.filter((e) => !adminEmails().includes(e)).map((e) => <div className="a-row" key={`e-${e}`}><span className="main"><span className="title">{e}</span></span><span className="chip chip-unknown">{t("allow.env")}</span></div>)}
        {allowed.map((a) => (
          <div className="a-row" key={a.email}>
            <span className="main"><span className="title">{a.email}</span><span className="detail" style={{ display: "block" }}>{[a.note, day(a.createdAt.toISOString())].filter(Boolean).join(" · ")}</span></span>
            <span className="chip chip-L">{t("allow.db")}</span>
            <form action={removeAllowedAction}><input type="hidden" name="email" value={a.email} /><button className="link-danger">{t("allow.remove")}</button></form>
          </div>
        ))}
        {allowed.length === 0 && <div className="a-empty">{t("allow.empty")}</div>}
      </div>
      <div className="a-panel a-pad" style={{ marginTop: 12 }}><AllowForm /></div>
    </section>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ wl?: string; invite?: string }> }) {
  const me = await requireAdmin();
  const db = getDb();
  const t = await getTranslations("admin");
  const { wl, invite } = await searchParams;
  const filter = WAITLIST_STATUS.find((s) => s === wl);
  const restricted = registrationRestricted();
  const [users, stats, gaps, notes] = await Promise.all([listUsers(db), adminStats(db), listFeedback(db), listRecentFeedback(db)]);

  return (
    <>
      <PageHead eyebrow={t("eyebrow")} title={t("title")} sub={t("sub")} />

      <div className="a-stats" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {([["users", stats.users], ["active", stats.active7d], ["members", stats.members], ["docs", stats.docs], ["files", size(stats.bytes)]] as const).map(([k, v]) => (
          <div className="a-stat" key={k}><div className="label">{t(`stats.${k}`)}</div><div className="value">{v}</div></div>
        ))}
      </div>

      <p className="muted" style={{ margin: "12px 0 0", fontSize: 13.5 }}>{t(restricted ? "registration.restricted" : "registration.open")}</p>

      {restricted && <WaitlistSection filter={filter} invite={invite} />}

      <section className="a-section">
        <SectionHead title={t("users.title")} />
        <div className="a-panel a-table-wrap">
          <table className="a-table">
            <thead><tr>
              <th>{t("users.email")}</th><th>{t("users.login")}</th><th>{t("users.joined")}</th><th>{t("users.lastSeen")}</th><th>{t("users.data")}</th><th>{t("users.status")}</th><th />
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.disabledAt ? "off" : ""}>
                  <td>
                    <b>{u.email}</b>
                    <div className="sub">
                      {u.isAdmin && <span className="chip chip-mint">{t("users.admin")}</span>}
                      {u.id === me.id && <span className="chip chip-unknown">{t("users.you")}</span>}
                      {!u.verified && <span className="chip chip-warn">{t("users.unverified")}</span>}
                    </div>
                  </td>
                  <td className="mono">{u.providers || "—"}</td>
                  <td className="mono">{day(u.createdAt)}</td>
                  <td className="mono">{day(u.lastSeen) ?? t("users.never")}</td>
                  <td>{t("users.dataSummary", { members: u.members, docs: u.docs, size: size(u.attachmentBytes) })}<div className="sub">{t("users.tokens", { n: u.tokens })} · {u.isAdmin ? t("users.quotaAdmin") : t("users.quota", { plan: u.plan, members: PLANS[u.plan === "pro" ? "pro" : "free"].members, size: size(PLANS[u.plan === "pro" ? "pro" : "free"].attachmentBytes), tokens: PLANS[u.plan === "pro" ? "pro" : "free"].tokens })}</div></td>
                  <td>{u.disabledAt ? <span className="chip chip-H">{t("users.disabled")}</span> : <span className="chip chip-N">{t("users.active")}</span>}</td>
                  <td>
                    {u.id !== me.id && !u.isAdmin && (
                      <form action={setDisabledAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="disable" value={u.disabledAt ? "0" : "1"} />
                        <button className={u.disabledAt ? "btn btn-glass btn-sm" : "link-danger"}>{u.disabledAt ? t("users.enable") : t("users.disable")}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {restricted && <AllowedSection t={t} />}

      <FeedbackSection items={notes} />
      <GapsSection gaps={gaps} />
    </>
  );
}
