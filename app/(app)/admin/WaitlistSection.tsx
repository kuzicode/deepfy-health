import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { listWaitlist, waitlistStats } from "@/server/waitlist";
import { SectionHead } from "@/ui/blocks";
import { decideWaitlistAction, resendInviteAction } from "./actions";

// 管理后台 · 早鸟申请：统计、按 agent 分布、按状态筛选的列表与审批

export const WAITLIST_STATUS = ["pending", "approved", "declined"] as const;
const STATUS_CHIP: Record<string, string> = { pending: "chip-warn", approved: "chip-N", declined: "chip-unknown" };
const day = (d: Date) => d.toISOString().slice(0, 10);

export async function WaitlistSection({ filter, invite }: { filter?: (typeof WAITLIST_STATUS)[number]; invite?: string }) {
  const db = getDb();
  const t = await getTranslations("admin");
  const [apps, wstats] = await Promise.all([listWaitlist(db, filter), waitlistStats(db)]);
  const agentMax = Math.max(1, ...wstats.agents.map((a) => a.n));
  const label = (g: string) => (t.has(`waitlist.agent.${g}` as "waitlist.title") ? t(`waitlist.agent.${g}` as "waitlist.title") : g);
  const statusText = (s: string) => (t.has(`waitlist.status.${s}` as "waitlist.title") ? t(`waitlist.status.${s}` as "waitlist.title") : s);

  return (
      <section className="a-section">
        <SectionHead title={t("waitlist.title")} />
        <p className="muted" style={{ margin: "-6px 0 12px", fontSize: 13.5 }}>{t("waitlist.hint")}</p>
        {invite === "sent" && <p role="status" className="a-invite-note ok">{t("waitlist.inviteSent")}</p>}
        {invite === "failed" && <p role="alert" className="a-invite-note err">{t("waitlist.inviteFailed")}</p>}
        <div className="a-stats">
          {([["total", wstats.total], ["pending", wstats.pending], ["week", wstats.week], ["approved", wstats.approved]] as const).map(([k, v]) => (
            <div className="a-stat" key={k}><div className="label">{t(`waitlist.stats.${k}`)}</div><div className="value">{v}</div></div>
          ))}
        </div>
        {wstats.agents.length > 0 && (
          <div className="a-panel a-pad wl-agents">
            {wstats.agents.map((a) => (
              <div key={a.agent} className="wl-bar">
                <span>{label(a.agent)}</span>
                <i style={{ width: `${(a.n / agentMax) * 100}%` }} /><b>{a.n}</b>
              </div>
            ))}
          </div>
        )}
        <nav className="wl-filter">
          <a href="/admin" className={!filter ? "on" : ""}>{t("waitlist.all")}</a>
          {WAITLIST_STATUS.map((s) => <a key={s} href={`/admin?wl=${s}`} className={filter === s ? "on" : ""}>{t(`waitlist.status.${s}`)}</a>)}
        </nav>
        <div className="a-panel a-table-wrap">
          <table className="a-table">
            <thead><tr><th>{t("users.email")}</th><th>{t("waitlist.agents")}</th><th>{t("waitlist.note")}</th><th>{t("waitlist.applied")}</th><th>{t("users.status")}</th><th /></tr></thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.email}>
                  <td><b>{a.email}</b><div className="sub">{[a.locale, a.source].filter(Boolean).join(" · ")}</div></td>
                  <td>{a.agents.map(label).join(", ") || "—"}</td>
                  <td style={{ maxWidth: 280 }}>{a.note || "—"}</td>
                  <td className="mono">{day(a.createdAt)}</td>
                  <td><span className={`chip ${STATUS_CHIP[a.status] ?? "chip-unknown"}`}>{statusText(a.status)}</span></td>
                  <td>
                    {a.status === "approved" ? (
                      <form action={resendInviteAction}>
                        <input type="hidden" name="email" value={a.email} />
                        <input type="hidden" name="wl" value={filter ?? ""} />
                        <button className="btn btn-glass btn-sm">{t("waitlist.resend")}</button>
                      </form>
                    ) : (
                      <form action={decideWaitlistAction} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input type="hidden" name="email" value={a.email} />
                        <input type="hidden" name="wl" value={filter ?? ""} />
                        <button name="approve" value="1" className="btn btn-primary btn-sm">{t("waitlist.approve")}</button>
                        {a.status === "pending" && <button name="approve" value="0" className="link-danger">{t("waitlist.decline")}</button>}
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {apps.length === 0 && <tr><td colSpan={6} className="a-empty">{t("waitlist.empty")}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
  );
}
