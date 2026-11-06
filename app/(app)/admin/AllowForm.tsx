"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { addAllowedAction } from "./actions";

export function AllowForm() {
  const t = useTranslations("admin.allow");
  const [state, action, pending] = useActionState(addAllowedAction, {});
  return (
    <form action={action} className="a-form">
      <input className="field" name="email" type="email" required placeholder={t("email")} />
      <input className="field" name="note" placeholder={t("note")} maxLength={80} />
      <button className="btn btn-primary" disabled={pending}>{t("add")}</button>
      {state.error && <p style={{ color: "var(--high)", margin: 0, flexBasis: "100%", fontSize: 13 }}>{t("invalid")}</p>}
    </form>
  );
}
