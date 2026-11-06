"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { ActionState } from "@/server/quick-entry";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** 「接下来」一行的操作：改日期（展开日期框）/ 已查·免查；有新结果时「已查 / 免查」是主按钮 */
export function ScheduleActions({ action, kind, codes, due, newResult }: { action: Action; kind: "recheck" | "checkup"; codes: string[]; due: string; newResult?: string }) {
  const t = useTranslations("app.member");
  const [state, submit, pending] = useActionState(action, {});
  const [editing, setEditing] = useState(false);
  const hidden = (<><input type="hidden" name="kind" value={kind} /><input type="hidden" name="codes" value={codes.join(",")} /></>);
  if (editing) {
    return (
      <form action={async (f) => { await submit(f); setEditing(false); }} className="sched-act">
        {hidden}<input type="hidden" name="action" value="reschedule" />
        <input className="field date" type="date" name="date" defaultValue={due} required />
        <button className="btn btn-primary btn-sm" disabled={pending}>{t("scheduleSave")}</button>
        <button type="button" className="btn btn-glass btn-sm" onClick={() => setEditing(false)}>{t("scheduleCancel")}</button>
      </form>
    );
  }
  return (
    <form action={submit} className="sched-act">
      {hidden}<input type="hidden" name="action" value="done" />
      <button type="button" className="btn btn-glass btn-sm" onClick={() => setEditing(true)}>{t("scheduleEdit")}</button>
      <button className={`btn ${newResult ? "btn-primary" : "btn-glass"} btn-sm`} disabled={pending}>{t("scheduleDone")}</button>
      {state.error && <span className="err">{t("scheduleError")}</span>}
    </form>
  );
}
