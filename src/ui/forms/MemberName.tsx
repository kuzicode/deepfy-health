"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

type State = { ok?: boolean; error?: string };

/** guard 返回的错误码 → 提示；其余（校验失败的说明文字）按称呼长度提示 */
const ERRORS: Record<string, "renameNotFound" | "renameFailed"> = { not_found: "renameNotFound", generic: "renameFailed" };

/** 概览标题里的称呼：点铅笔原地改名（服务端同时更新成员表与档案） */
export function MemberName({ name, action }: { name: string; action: (prev: State, form: FormData) => Promise<State> }) {
  const t = useTranslations("app.member");
  const [editing, setEditing] = useState(false);
  const [state, submit, pending] = useActionState(action, {});
  useEffect(() => { if (state.ok) setEditing(false); }, [state]);

  if (!editing) {
    return (
      <span className="a-name">
        {name}
        <button type="button" className="edit" aria-label={t("rename")} title={t("rename")} onClick={() => setEditing(true)}><Pencil size={16} /></button>
      </span>
    );
  }
  return (
    <form action={submit} className="a-name-form">
      <input className="field" name="name" defaultValue={name} maxLength={40} autoFocus required aria-label={t("rename")} />
      <button className="btn btn-primary btn-sm" disabled={pending}>{t("renameSave")}</button>
      <button type="button" className="btn btn-glass btn-sm" onClick={() => setEditing(false)}>{t("renameCancel")}</button>
      {state.error && <span className="err">{t(ERRORS[state.error] ?? "renameError")}</span>}
    </form>
  );
}
