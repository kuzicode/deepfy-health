"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { RELATIONS, type Profile } from "@/core/schema";
import type { ActionState } from "@/server/quick-entry";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

// 档案页的编辑开关：基础数值、病史过敏（逗号分隔）、生活习惯、体检周期
export function ProfileEditor({ profile: p, action }: { profile: Profile; action: Action }) {
  const t = useTranslations("app.profile");
  const r = useTranslations("app.relation");
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);
  const f = (k: string) => t(`fields.${k}` as "fields.name");

  if (!open) return <button type="button" className="btn btn-glass btn-sm" onClick={() => setOpen(true)}><Pencil size={14} />{t("edit")}</button>;
  const input = (name: string, label: string, value: string | number | undefined, extra: Record<string, string> = {}) => (
    <label className="a-field"><span>{label}</span><input className="field" name={name} type="text" defaultValue={value ?? ""} {...extra} /></label>
  );
  return (
    <form action={formAction} className="a-panel a-pad a-profile-form">
      <div className="grid">
        <label className="a-field"><span>{f("relation")}</span>
          <select className="field" name="relation" defaultValue={p.relation ?? ""}>
            <option value="">—</option>
            {RELATIONS.map((k) => <option key={k} value={k}>{r(k)}</option>)}
          </select>
        </label>
        {input("birth_date", p.birth_estimated ? f("birthHint") : f("birth"), p.birth_estimated ? "" : p.birth_date, { type: "date", min: "1900-01-01" })}
      </div>
      <div className="grid">
        {input("height_cm", `${f("height")} (cm)`, p.height_cm, { type: "number", step: "0.1", min: "50", max: "250" })}
        {input("weight_kg", `${f("weight")} (kg)`, p.weight_kg, { type: "number", step: "0.1", min: "2", max: "400" })}
        {input("blood_type", f("blood"), p.blood_type, { maxLength: "10" })}
        {input("checkup_interval_months", `${f("interval")} (${t("monthsUnit")})`, p.checkup_interval_months, { type: "number", min: "1", max: "60" })}
      </div>
      <p className="hint">{t("listHint")}</p>
      <div className="grid">
        {input("conditions", f("conditions"), p.conditions.join("、"))}
        {input("allergies", f("allergies"), p.allergies.join("、"))}
        {input("family_history", f("family"), p.family_history.join("、"))}
      </div>
      <div className="grid">
        {input("sleep", f("sleep"), p.habits.sleep)}
        {input("diet", f("diet"), p.habits.diet)}
        {input("exercise", f("exercise"), p.habits.exercise)}
        {input("smoking", f("smoking"), p.habits.smoking)}
        {input("alcohol", f("alcohol"), p.habits.alcohol)}
      </div>
      {state.error && <p className="a-form-err">{t("saveError")}</p>}
      <div className="row end">
        <button type="button" className="btn btn-glass btn-sm" onClick={() => setOpen(false)}>{t("cancel")}</button>
        <button className="btn btn-primary btn-sm" disabled={pending}>{t("save")}</button>
      </div>
    </form>
  );
}
