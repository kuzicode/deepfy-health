"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/client/auth-client";
import { clearSignedInMark } from "@/client/signed-in-mark";
import { deleteAccountAction } from "./actions";

export function DeleteAccountForm({ email }: { email: string }) {
  const t = useTranslations("app.settings");
  const [state, action, pending] = useActionState(deleteAccountAction, {});
  return (
    <form action={action} className="a-form">
      <p className="muted" style={{ margin: 0, flexBasis: "100%" }}>{t("deleteText")}</p>
      <input className="field" name="confirm" placeholder={t("deleteConfirm", { email })} autoComplete="off" />
      <button className="btn btn-danger" disabled={pending}>{t("deleteButton")}</button>
      {state.error && <p style={{ color: "var(--high)", margin: 0, flexBasis: "100%" }}>{t("deleteMismatch")}</p>}
    </form>
  );
}

export function SignOutButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-glass btn-sm" onClick={async () => { await authClient.signOut(); clearSignedInMark(); window.location.assign("/login"); }}>
      {label}
    </button>
  );
}

/** 让其他设备上的登录失效；Agent 的 token 在「Agent 接入」页单独撤销 */
export function SignOutOthersButton() {
  const t = useTranslations("app.settings");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const run = async () => {
    setState("busy");
    const res = await authClient.revokeOtherSessions().catch(() => ({ error: true }));
    setState(res.error ? "error" : "done");
  };
  return (
    <>
      <button type="button" className="btn btn-glass btn-sm" disabled={state === "busy"} onClick={run}>{t("signOutOthers")}</button>
      {state === "done" && <span className="muted" style={{ fontSize: 13 }}>{t("signOutOthersDone")}</span>}
      {state === "error" && <span style={{ color: "var(--high)", fontSize: 13 }}>{t("passwordError")}</span>}
    </>
  );
}

/** 设置 / 修改密码：先给本人邮箱发验证码，再设新密码（better-auth 会为只用 Google 的账号新建密码登录方式） */
export function PasswordForm({ email, hasPassword: initial }: { email: string; hasPassword: boolean }) {
  const t = useTranslations("app.settings");
  const [hasPassword, setHasPassword] = useState(initial);
  const [stage, setStage] = useState<"idle" | "code" | "done">("idle");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const call = async (fn: () => Promise<{ error?: unknown } | void>, next: () => void) => {
    setBusy(true);
    setError(false);
    const res = await fn().catch(() => ({ error: true }));
    setBusy(false);
    if (res && res.error) setError(true);
    else next();
  };
  const send = () => call(() => authClient.emailOtp.sendVerificationOtp({ email, type: "forget-password" }), () => setStage("code"));
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    call(() => authClient.emailOtp.resetPassword({ email, otp, password }), () => { setStage("done"); setHasPassword(true); setOtp(""); setPassword(""); });
  };

  return (
    <div className="a-form">
      <p className="muted" style={{ margin: 0, flexBasis: "100%" }}>{hasPassword ? t("passwordSet") : t("passwordNone")}</p>
      {stage === "code" ? (
        <form onSubmit={save} className="a-form" style={{ flexBasis: "100%" }}>
          <p className="muted" style={{ margin: 0, flexBasis: "100%" }}>{t("passwordSent", { email })}</p>
          <input className="field" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder={t("passwordCode")} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
          <input className="field" type="password" autoComplete="new-password" placeholder={t("passwordNew")} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || otp.length !== 6 || password.length < 8}>{t("passwordSave")}</button>
          <button type="button" className="btn btn-glass btn-sm" disabled={busy} onClick={send}>{t("passwordResend")}</button>
          <button type="button" className="btn btn-glass btn-sm" onClick={() => { setStage("idle"); setOtp(""); setPassword(""); setError(false); }}>{t("passwordCancel")}</button>
        </form>
      ) : (
        <button type="button" className="btn btn-glass btn-sm" disabled={busy} onClick={send}>{hasPassword ? t("passwordChange") : t("passwordSetup")}</button>
      )}
      {stage === "done" && <p style={{ color: "var(--ok)", margin: 0, flexBasis: "100%" }}>{t("passwordDone")} <a href="/login">{t("passwordRelogin")}</a></p>}
      {error && <p style={{ color: "var(--high)", margin: 0, flexBasis: "100%" }}>{t("passwordError")}</p>}
    </div>
  );
}
