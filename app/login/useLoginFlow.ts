"use client";

import { setInitialPassword } from "./actions";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/client/auth-client";

// 登录流程的状态与请求（界面在 LoginView）：先邮箱后分流 start → password / otp / create(→verify) / reset / apply(→applied)；
// Google 新用户走 google-new 勾选同意

export type Step = "start" | "password" | "otp" | "create" | "verify" | "reset" | "setpw" | "google-new" | "apply" | "applied";
export type OtpType = "email-verification" | "sign-in" | "forget-password";
type Result = { error?: { code?: string; message?: string; status?: number } | null } | void;
type Msg = { kind: "error" | "info"; text: string } | undefined;

export function useLoginFlow(error?: string, canApply = false) {
  const t = useTranslations("login");
  const errText = (code?: string, message?: string) =>
    code && t.has(`errors.${code}` as "errors.generic") ? t(`errors.${code}` as "errors.generic") : message ?? t("errors.generic");

  // Google 账号未开通时直接进申请表，否则这里是死路（ISS-015）
  const [step, setStep] = useState<Step>(error === "signup_disabled" ? "google-new" : error === "not_allowed" && canApply ? "apply" : "start");
  const [msg, setMsg] = useState<Msg>(error && error !== "signup_disabled" ? { kind: "error", text: errText(error) } : undefined);
  const [email, setEmailState] = useState("");
  const emailRef = useRef(""); // 最新输入，用来丢弃过期的查询结果
  const setEmail = (v: string) => { emailRef.current = v; setEmailState(v); };
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<Result>, onOk?: () => void) => {
    setBusy(true);
    setMsg(undefined);
    const res: Result = await fn().catch(() => ({ error: { code: "network" } }));
    setBusy(false);
    const err = (res && res.error) || null;
    // 限速没有 code，按状态码显示，不把英文原文给用户看
    if (err) setMsg({ kind: "error", text: errText(err.code ?? (err.status === 429 ? "rate_limited" : undefined), err.message) });
    else onOk?.();
    return err;
  };
  const go = (s: Step, m?: Msg) => { setStep(s); setMsg(m); setOtp(""); setShowPw(false); };
  const home = () => window.location.assign("/");
  // 验证邮箱时服务器会作废验证前的密码（防抢注），这里把用户刚输入的密码设上；失败也不影响登录，之后可在设置页设置
  const afterVerify = () => { void (password ? setInitialPassword(password).catch(() => {}) : Promise.resolve()).then(home); };
  const sendCode = (type: OtpType, to = email) =>
    run(() => authClient.emailOtp.sendVerificationOtp({ email: to, type }), () => setMsg({ kind: "info", text: t("sent", { email: to }) }));
  const google = (signUp: boolean) =>
    authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/login", requestSignUp: signUp });

  // 查询期间输入框只读；返回时邮箱若已变化则丢弃结果，避免分流 / 验证码与当前邮箱错配
  const lookup = () => run(async () => {
    const asked = email;
    const res = await fetch("/api/login-lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: asked }) });
    const body = (await res.json().catch(() => ({}))) as { next?: string; error?: string };
    if (emailRef.current !== asked) return;
    if (!res.ok || !body.next) return { error: { code: body.error ?? "generic" } };
    setPassword("");
    setAgreed(false);
    go(body.next === "closed" ? "apply" : (body.next as Step)); // 未开通的邮箱 → 申请早鸟资格
    if (body.next === "otp") await sendCode("sign-in", asked);
  });

  // 申请结果：进了候补 → 完成页；邮箱已开通 → 回到登录，邮箱已填好
  const applyDone = (next: string) => {
    if (next === "closed") go("applied");
    else go("start", { kind: "info", text: t(next === "create" ? "apply.canCreate" : "apply.hasAccount") });
  };

  const passwordLogin = async () => {
    const err = await run(() => authClient.signIn.email({ email, password }), home);
    if (err?.code !== "EMAIL_NOT_VERIFIED") return;
    go("verify");
    await sendCode("email-verification");
  };
  const register = () => run(() => authClient.signUp.email({ email, password, name: email.split("@")[0] }), () =>
    go("verify", { kind: "info", text: t("sent", { email }) }));
  const submit = (fn: () => unknown) => (e: React.FormEvent) => { e.preventDefault(); if (!busy) fn(); };

  return {
    t, errText, step, msg, setMsg, email, setEmail, password, setPassword, showPw, setShowPw, otp, setOtp, agreed, setAgreed, busy,
    run, go, home, afterVerify, sendCode, google, lookup, applyDone, passwordLogin, register, submit, canApply,
  };
}

export type LoginFlow = ReturnType<typeof useLoginFlow>;
