"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { setupOwner, type SetupState } from "./actions";

export function SetupForm() {
  const t = useTranslations("setup");
  const [state, action, pending] = useActionState<SetupState, FormData>(setupOwner, {});
  const error = state.error && (state.error === "mismatch" || state.error === "localOnly" ? t(state.error) : t(`errors.${state.error}`));
  return (
    <form className="l-form" action={action}>
      {error && <p className="l-msg err" role="alert">{error}</p>}
      <input className="l-input" name="name" autoComplete="name" placeholder={t("name")} maxLength={100} required />
      <input className="l-input" name="email" type="email" autoComplete="email" placeholder={t("email")} maxLength={254} required />
      <input className="l-input" name="password" type="password" autoComplete="new-password" placeholder={t("password")} minLength={8} maxLength={128} required />
      <input className="l-input" name="confirm" type="password" autoComplete="new-password" placeholder={t("confirm")} minLength={8} maxLength={128} required />
      <button className="l-btn" type="submit" disabled={pending}>{t("submit")}</button>
    </form>
  );
}
