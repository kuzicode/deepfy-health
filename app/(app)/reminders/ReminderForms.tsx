"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { emailAction } from "./actions";

/** 换收件邮箱：填新邮箱 → 收验证码 → 输入验证码后生效（填回登录邮箱则直接恢复默认） */
export function EmailForm({ current }: { current: string }) {
  const t = useTranslations("app.reminders");
  const [state, action, pending] = useActionState(emailAction, {});
  return (
    <form action={action} className="a-form" key={state.ok ? "done" : "edit"}>
      {state.stage === "code" ? (
        <>
          <input className="field" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder={t("codePlaceholder")} required />
          <button className="btn btn-primary" disabled={pending}>{t("confirm")}</button>
          <p className="muted a-form-note">{t("codeSent")}</p>
        </>
      ) : (
        <>
          <input className="field" name="email" type="email" defaultValue={current} maxLength={200} required />
          <button className="btn btn-glass" disabled={pending}>{t("changeEmail")}</button>
        </>
      )}
      {state.error && <p className="a-form-note err">{t(`error.${state.error}` as "error.badCode")}</p>}
      {state.ok && <p className="a-form-note ok">{t("saved")}</p>}
    </form>
  );
}

