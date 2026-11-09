"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/client/auth-client";

/** 自托管版登录：只有邮箱 + 密码。账号由管理员添加，忘记密码找管理员重置 */
export function SelfLoginView({ error }: { error?: string }) {
  const t = useTranslations("login");
  const errText = (code?: string) => (code && t.has(`errors.${code}` as "errors.generic") ? t(`errors.${code}` as "errors.generic") : t("errors.generic"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(error ? errText(error) : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(undefined);
    const res = await authClient.signIn.email({ email, password }).catch(() => ({ error: { code: "network", status: 0 } }));
    if (!res.error) return window.location.assign("/");
    setBusy(false);
    setMsg(errText(res.error.code ?? (res.error.status === 429 ? "rate_limited" : undefined)));
  }

  return (
    <div className="l-card">
      <h1>{t("title_welcome")}</h1>
      {msg && <p className="l-msg err" role="alert">{msg}</p>}
      <form className="l-form" onSubmit={submit}>
        <input className="l-input" type="email" autoComplete="email" placeholder={t("email")} value={email} onChange={(e) => setEmail(e.target.value.trim())} required />
        <input className="l-input" type="password" autoComplete="current-password" placeholder={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="l-btn" type="submit" disabled={busy || !email || !password}>{t("continue")}</button>
      </form>
      <p className="l-sub">{t("self.forgot")}</p>
    </div>
  );
}
