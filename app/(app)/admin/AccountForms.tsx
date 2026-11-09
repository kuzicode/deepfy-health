"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { addUserAction, deleteUserAction, resetUserPasswordAction, type AccountFormState } from "./actions";

// 自托管版的账号管理表单：添加账号；每个账号的「管理」里重置密码和删除

const ok = { color: "var(--ok)", margin: 0, flexBasis: "100%" } as const;
const bad = { color: "var(--high)", margin: 0, flexBasis: "100%" } as const;

export function AddUserForm() {
  const t = useTranslations("admin.accounts");
  const [state, action, pending] = useActionState<AccountFormState, FormData>(addUserAction, {});
  return (
    <form action={action} className="a-form" key={state.done ? "done" : "form"}>
      <input className="field" name="name" placeholder={t("name")} maxLength={100} required />
      <input className="field" name="email" type="email" placeholder={t("email")} maxLength={254} autoComplete="off" required />
      <input className="field" name="password" type="text" placeholder={t("password")} minLength={8} maxLength={128} autoComplete="off" required />
      <button className="btn btn-primary" disabled={pending}>{t("add")}</button>
      {state.done && <p style={ok}>{t("added")}</p>}
      {state.error && <p style={bad}>{t(`errors.${state.error === "mismatch" ? "generic" : state.error}`)}</p>}
    </form>
  );
}

export function UserTools({ userId, email }: { userId: string; email: string }) {
  const t = useTranslations("admin.users");
  const [reset, resetAction, resetting] = useActionState<AccountFormState, FormData>(resetUserPasswordAction, {});
  const [del, delAction, deleting] = useActionState<AccountFormState, FormData>(deleteUserAction, {});
  return (
    <details className="a-user-tools">
      <summary>{t("manage")}</summary>
      <form action={resetAction} className="a-form">
        <input type="hidden" name="userId" value={userId} />
        <input className="field" name="password" type="text" placeholder={t("newPassword")} minLength={8} maxLength={128} autoComplete="off" required />
        <button className="btn btn-glass btn-sm" disabled={resetting}>{t("resetPassword")}</button>
        {reset.done && <p style={ok}>{t("resetDone")}</p>}
        {reset.error && <p style={bad}>{t("actionFailed")}</p>}
      </form>
      <form action={delAction} className="a-form">
        <input type="hidden" name="userId" value={userId} />
        <p className="muted" style={{ margin: 0, flexBasis: "100%", fontSize: 13 }}>{t("deleteHint")}</p>
        <input className="field" name="confirm" placeholder={t("deleteConfirm", { email })} autoComplete="off" />
        <button className="btn btn-danger btn-sm" disabled={deleting}>{t("deleteUser")}</button>
        {del.error && <p style={bad}>{t(del.error === "mismatch" ? "deleteMismatch" : "actionFailed")}</p>}
      </form>
    </details>
  );
}
