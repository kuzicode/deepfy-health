"use client";

import { Eye, EyeOff } from "lucide-react";
import { authClient } from "@/client/auth-client";
import { ApplyForm } from "./ApplyForm";
import { useLoginFlow, type LoginFlow, type OtpType, type Step } from "./useLoginFlow";

// 登录卡片：各步骤的界面；状态与请求在 useLoginFlow

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

function Field({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <label className="ff">
      <span className="ff-label">{label}</span>
      {children}
      {action}
    </label>
  );
}

type Legal = { terms: string; privacy: string };

/** 各步骤共用的输入框和按钮 */
function useFields(f: LoginFlow, legal: Legal) {
  const { t } = f;
  const emailRO = (
    <Field label={t("email")} action={<button type="button" className="ff-action" onClick={() => f.go("start")}>{t("edit")}</button>}>
      <input className="ff-input" value={f.email} readOnly tabIndex={-1} />
    </Field>
  );
  const pwField = (label: string, auto: string) => (
    <Field label={label} action={
      <button type="button" className="ff-action icon" aria-label={t(f.showPw ? "hide" : "show")} onClick={() => f.setShowPw((v) => !v)}>
        {f.showPw ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>}>
      <input className="ff-input" type={f.showPw ? "text" : "password"} autoComplete={auto} autoFocus={auto === "current-password"} value={f.password} onChange={(e) => f.setPassword(e.target.value)} />
    </Field>
  );
  const otpField = (type: OtpType) => (
    <Field label={t("code")} action={<button type="button" className="ff-action" disabled={f.busy} onClick={() => f.sendCode(type)}>{t("resend")}</button>}>
      <input className="ff-input otp" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={f.otp} onChange={(e) => f.setOtp(e.target.value.replace(/\D/g, ""))} />
    </Field>
  );
  const consent = (
    <label className="consent">
      <input type="checkbox" checked={f.agreed} onChange={(e) => f.setAgreed(e.target.checked)} />
      <span>{t("agreeAll")} <a href={legal.terms} target="_blank">{t("terms")}</a> {t("and")} <a href={legal.privacy} target="_blank">{t("privacy")}</a>{t("agreeData")}</span>
    </label>
  );
  const primary = (label: string, disabled: boolean) => <button className="l-btn" disabled={f.busy || disabled}>{label}</button>;
  const link = (label: string, onClick: () => void) => <button type="button" className="l-link" onClick={onClick}>{label}</button>;
  return { emailRO, pwField, otpField, consent, primary, link };
}
type Fields = ReturnType<typeof useFields>;

/** 邮箱、密码、验证码相关的步骤 */
function signInViews(f: LoginFlow, u: Fields): Partial<Record<Step, React.ReactNode>> {
  const { t } = f;
  const resetView = (
    <form className="l-form" onSubmit={f.submit(() => f.run(() => authClient.emailOtp.resetPassword({ email: f.email, otp: f.otp, password: f.password }), () =>
      f.go("password", { kind: "info", text: t(f.step === "setpw" ? "setDone" : "resetDone") })))}>
      {u.emailRO}{u.otpField("forget-password")}{u.pwField(t("resetPassword"), "new-password")}
      {u.primary(t("continue"), f.otp.length !== 6 || f.password.length < 8)}
    </form>
  );
  return {
    start: (
      <>
        <button type="button" className="l-oauth" onClick={() => f.google(false)}><GoogleIcon />{t("google")}</button>
        <div className="l-or"><span>{t("or")}</span></div>
        <form className="l-form" onSubmit={f.submit(f.lookup)}>
          <input className="l-input" type="email" autoComplete="email" placeholder={t("email")} value={f.email} readOnly={f.busy} onChange={(e) => f.setEmail(e.target.value.trim())} />
          {u.primary(t("continue"), !/^\S+@\S+\.\S+$/.test(f.email))}
        </form>
        {f.canApply && <div className="l-alt"><span className="l-hint">{t("apply.ask")}</span>{u.link(t("title_apply"), () => f.go("apply"))}</div>}
      </>
    ),
    password: (
      <form className="l-form" onSubmit={f.submit(f.passwordLogin)}>
        {u.emailRO}{u.pwField(t("password"), "current-password")}
        <div className="l-row">{u.link(t("forgot"), () => { f.setPassword(""); f.go("reset"); f.sendCode("forget-password"); })}</div>
        {u.primary(t("continue"), !f.password)}
        <div className="l-alt">{u.link(t("useCode"), () => { f.go("otp"); f.sendCode("sign-in"); })}</div>
      </form>
    ),
    otp: (
      <form className="l-form" onSubmit={f.submit(() => f.run(() => authClient.signIn.emailOtp({ email: f.email, otp: f.otp }), f.home))}>
        {u.emailRO}{u.otpField("sign-in")}{u.primary(t("continue"), f.otp.length !== 6)}
        <div className="l-alt">{u.link(t("setPassword"), () => { f.setPassword(""); f.go("setpw"); f.sendCode("forget-password"); })}</div>
      </form>
    ),
    verify: (
      <form className="l-form" onSubmit={f.submit(() => f.run(() => authClient.emailOtp.verifyEmail({ email: f.email, otp: f.otp }), f.afterVerify))}>
        {u.emailRO}{u.otpField("email-verification")}{u.primary(t("continue"), f.otp.length !== 6)}
      </form>
    ),
    reset: resetView,
    setpw: resetView,
  };
}

/** 注册、申请内测、Google 新用户 */
function signUpViews(f: LoginFlow, u: Fields): Partial<Record<Step, React.ReactNode>> {
  const { t } = f;
  return {
    create: (
      <form className="l-form" onSubmit={f.submit(f.register)}>
        {u.emailRO}{u.pwField(t("newPassword"), "new-password")}{u.consent}
        {u.primary(t("continue"), !f.agreed || f.password.length < 8)}
      </form>
    ),
    apply: (
      <>
        <ApplyForm email={f.email} setEmail={f.setEmail} onDone={f.applyDone} onError={(code) => f.setMsg({ kind: "error", text: f.errText(code) })} />
        <div className="l-alt"><span className="l-hint">{t("apply.haveAccess")}</span>{u.link(t("apply.toLogin"), () => f.go("start"))}</div>
      </>
    ),
    applied: (
      <div className="l-form">
        <p className="l-done">{t("apply.done", { email: f.email })}</p>
        <div className="l-alt">{u.link(t("back"), () => f.go("start"))}</div>
      </div>
    ),
    "google-new": (
      <div className="l-form">
        {u.consent}
        <button type="button" className="l-oauth" disabled={!f.agreed} onClick={() => f.google(true)}><GoogleIcon />{t("googleCreate")}</button>
        <div className="l-alt">{u.link(t("back"), () => f.go("start"))}</div>
      </div>
    ),
  };
}

const SUB: Partial<Record<Step, string>> = { start: "sub_start", "google-new": "sub_google", apply: "apply.sub" };

export function LoginView({ error, legal, canApply }: { error?: string; legal: Legal; canApply: boolean }) {
  const f = useLoginFlow(error, canApply);
  const u = useFields(f, legal);
  const { t, step, msg } = f;
  const view = { ...signInViews(f, u), ...signUpViews(f, u) }[step];
  const sub = SUB[step];
  return (
    <div className="l-card">
      <h1>{t(`title_${step === "google-new" ? "create" : step}` as "title_start")}</h1>
      {sub && <p className="l-sub">{t(sub as "sub_start")}</p>}
      {msg && <p className={msg.kind === "error" ? "l-msg err" : "l-msg"} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</p>}
      {view}
    </div>
  );
}
