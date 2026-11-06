import { getLocale, getTranslations } from "next-intl/server";
import { cloudMode, getDb } from "@/db/client";
import { requireUser, userRepository } from "@/server/session";
import { asScope, listTokens } from "@/server/tokens";
import { siteUrl } from "@/site-links";
import { PageHead, SectionHead } from "@/ui/blocks";
import { revertChangeAction, revokeTokenAction, setScopeAction } from "./actions";
import { NewTokenForm, TokenActions } from "./AgentForms";

const SCOPE_LABEL = { read: "scopeRead", write: "scopeWrite", sync: "scopeSync" } as const;
const MAKE_LABEL = { read: "makeRead", write: "makeWrite", sync: "makeSync" } as const;
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : undefined);

export default async function AgentsPage() {
  const t = await getTranslations("app.settings");
  if (!cloudMode()) return <><PageHead eyebrow="MCP" title={t("tokens")} /><div className="a-panel a-empty">{t("localMode")}</div></>;
  const u = await requireUser();
  const tokens = await listTokens(getDb(), u.id);
  const repo = await userRepository();
  const changes = await repo.listAgentChanges(30);
  const names = changes.length ? new Map((await repo.snapshot()).members.map((m) => [m.id, m.name])) : new Map<string, string>();
  const target = (kind: string, key: string) => (key ? `${t(`kind.${kind}` as never)} · ${key}` : t(`kind.${kind}` as never));
  return (
    <>
      <PageHead eyebrow="MCP" title={t("tokens")} />
      <div className="a-settings">
        <section>
          <p className="muted a-lead">{t("tokensHint")} <a href={`${siteUrl(await getLocale())}/docs#agents`} target="_blank" rel="noopener">{t("docsLink")}</a></p>
          <div className="a-panel a-pad"><NewTokenForm /></div>
          {tokens.length > 0 && (
            <div className="a-panel a-rows" style={{ marginTop: 10 }}>
              {tokens.map((tk) => (
                <div key={tk.id} className="a-row a-row-wrap">
                  <span className="main">
                    <span className="title">{tk.name} <span className={`a-scope${tk.scope === "read" ? "" : " w"}`}>{t(SCOPE_LABEL[asScope(tk.scope)])}</span></span>
                    <span className="detail mono" style={{ display: "block", fontSize: 11.5 }}>{t("created", { date: fmt(tk.createdAt)! })} · {t("lastUsed", { date: fmt(tk.lastUsedAt) ?? t("neverUsed") })}</span>
                    {!tk.revealable && <span className="detail" style={{ display: "block", fontSize: 12 }}>{t("legacyToken")}</span>}
                  </span>
                  <TokenActions id={tk.id} revealable={tk.revealable} />
                  {(["read", "write", "sync"] as const).filter((s) => s !== asScope(tk.scope)).map((s) => (
                    <form key={s} action={setScopeAction}>
                      <input type="hidden" name="id" value={tk.id} /><input type="hidden" name="scope" value={s} />
                      <button className="btn btn-glass btn-sm">{t(MAKE_LABEL[s])}</button>
                    </form>
                  ))}
                  <form action={revokeTokenAction}><input type="hidden" name="id" value={tk.id} /><button className="link-danger">{t("revoke")}</button></form>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHead title={t("changesTitle")} />
          <p className="muted a-lead">{t("changesHint")}</p>
          <div className="a-panel a-rows">
            {changes.length === 0 && <div className="a-empty">{t("noChanges")}</div>}
            {changes.map((c) => (
              <div key={c.id} className="a-row">
                <span className="main">
                  <span className="title">{names.get(c.member) ?? c.member} · {target(c.kind, c.key)}</span>
                  <span className="detail mono" style={{ display: "block", fontSize: 11.5 }}>{fmt(c.createdAt)} · {c.tokenName} · {c.tool}</span>
                </span>
                {c.revertedAt ? <span className="muted" style={{ fontSize: 13 }}>{t("reverted")}</span>
                  : c.revertible ? <form action={revertChangeAction}><input type="hidden" name="id" value={c.id} /><button className="btn btn-glass btn-sm">{t("revert")}</button></form>
                  : <span className="muted" style={{ fontSize: 12.5 }}>{t("superseded")}</span>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
