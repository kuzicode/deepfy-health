"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { CopyButton } from "@/ui/CopyButton";
import { createTokenAction, revealTokenAction, rotateTokenAction } from "./actions";
import { mcpSnippets } from "@/mcp-snippets";

export function NewTokenForm() {
  const t = useTranslations("app.settings");
  const [state, action, pending] = useActionState(createTokenAction, {});
  return (
    <form action={action} className="a-form">
      <input className="field" name="name" placeholder={t("tokenName")} maxLength={60} />
      <button className="btn btn-primary" disabled={pending}>{t("createToken")}</button>
      <select className="field" name="scope" defaultValue="write" aria-label={t("scopeLabel")}>
        <option value="read">{t("scopeRead")}</option>
        <option value="write">{t("scopeWrite")}</option>
        <option value="sync">{t("scopeSync")}</option>
      </select>
      <p className="muted" style={{ margin: 0, flexBasis: "100%", fontSize: 13 }}>{t("scopeSyncHint")}</p>
      {state.token && <TokenSnippets token={state.token} />}
      {state.quota && <p className="a-form-err" style={{ flexBasis: "100%" }}>{t("tokenQuota", { limit: state.quota })}</p>}
    </form>
  );
}

/**
 * 已有接入：「复制配置」随时取回提示词（token 加密保存）；「重新生成」换新密钥，旧的立即失效。
 * 旧 token 没有加密副本，只能重新生成一次。
 */
export function TokenActions({ id, revealable }: { id: string; revealable: boolean }) {
  const t = useTranslations("app.settings");
  const [rotated, rotate, rotating] = useActionState(rotateTokenAction, {});
  const [shown, setShown] = useState<string>();
  const [busy, setBusy] = useState(false);
  const token = rotated.token ?? shown;
  const toggle = async () => {
    if (token) { setShown(undefined); return; }
    setBusy(true);
    setShown((await revealTokenAction(id).catch(() => ({ token: undefined }))).token);
    setBusy(false);
  };
  return (
    <>
      {revealable && !rotated.token && (
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={toggle}>{shown ? t("hideSetup") : t("showSetup")}</button>
      )}
      <form action={rotate} onSubmit={(e) => { if (!window.confirm(t("rotateConfirm"))) e.preventDefault(); }}>
        <input type="hidden" name="id" value={id} />
        <button className="btn btn-glass btn-sm" disabled={rotating}>{t("rotate")}</button>
      </form>
      {token && <div className="a-row-full"><TokenSnippets token={token} /></div>}
    </>
  );
}

/** 创建后一次性显示：给 agent 的配置提示词（含 token，一键复制）+ token 本身 + 各 agent 的手动配置（MCP 端点为当前站点 /mcp） */
function TokenSnippets({ token }: { token: string }) {
  const t = useTranslations("app.settings");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/mcp`;
  const prompt = t("agentPrompt", { url, token });
  const snippets: [string, string][] = [...mcpSnippets(url, token, t("snippetGeneric")), ["kzh", `pnpm kzh login --server ${origin} --token ${token}`]];
  return (
    <div className="token-once">
      <p className="step">{t("promptStep")}</p>
      <pre className="prompt"><code>{prompt}</code></pre>
      <div className="row"><CopyButton text={prompt} label={t("copyPrompt")} primary copied={t("copied")} /></div>
      <p className="muted">{t("tokenOnce")}</p>
      <div className="row"><code className="tok">{token}</code><CopyButton text={token} label={t("copyToken")} copied={t("copied")} /></div>
      <details>
        <summary>{t("manualSetup")}</summary>
        <p className="muted">{t("snippetHint")}</p>
        {snippets.map(([label, code]) => (
          <div key={label} className="snip">
            <div className="row"><b>{label}</b><CopyButton text={code} label={t("copy")} copied={t("copied")} /></div>
            <pre><code>{code}</code></pre>
          </div>
        ))}
      </details>
    </div>
  );
}
