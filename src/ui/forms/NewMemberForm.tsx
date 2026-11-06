"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { RELATIONS } from "@/core/schema";
import { AvatarField } from "./AvatarChooser";

type Action = (prev: { error?: string }, form: FormData) => Promise<{ error?: string }>;

// 建档：头像（默认挑一个家里没人用的，可换）+ 昵称随便填 + 与你的关系（可选）；出生日期或大概年龄二选一（不必去查父母的生日）；成功后跳到该成员页
/** suggested：默认选中的头像（家里还没人用的）；不给则不显示头像选择（本地模式） */
export function NewMemberForm({ action, today, compact = false, suggested }: { action: Action; today: string; compact?: boolean; suggested?: string }) {
  const t = useTranslations("app.newMember");
  const r = useTranslations("app.relation");
  const [state, formAction, pending] = useActionState(action, {});
  const [byAge, setByAge] = useState(false);
  const [avatar, setAvatar] = useState(suggested);
  return (
    <form action={formAction} className={`a-newmember${compact ? " compact" : ""}`}>
      <div className="a-nm-name">
        {suggested && <AvatarField value={avatar} onChange={setAvatar} />}
        <input className="field" name="name" required maxLength={40} placeholder={t("name")} />
      </div>
      <select className="field" name="relation" defaultValue="">
        <option value="">{t("relation")}</option>
        {RELATIONS.map((k) => <option key={k} value={k}>{r(k)}</option>)}
      </select>
      <select className="field" name="sex" required defaultValue="">
        <option value="" disabled>{t("sex")}</option>
        <option value="male">{t("male")}</option>
        <option value="female">{t("female")}</option>
      </select>
      <div className="a-date">
        <span className="a-birth-mode">
          <button type="button" className={byAge ? "" : "on"} onClick={() => setByAge(false)}>{t("birth")}</button>
          <button type="button" className={byAge ? "on" : ""} onClick={() => setByAge(true)}>{t("age")}</button>
        </span>
        {byAge
          ? <input key="age" className="field" type="number" name="age" required min="0" max="120" step="1" placeholder={t("agePlaceholder")} />
          : <input key="birth" className="field" type="date" name="birth_date" required max={today} min="1900-01-01" />}
      </div>
      <input className="field" type="number" name="height_cm" step="0.1" min="50" max="250" placeholder={t("height")} />
      <input className="field" type="number" name="weight_kg" step="0.1" min="2" max="400" placeholder={t("weight")} />
      <button className="btn btn-primary" disabled={pending}>{t("create")}</button>
      {state.error && <p className="a-form-err">{t(state.error === "quota" ? "quota" : "invalid")}</p>}
    </form>
  );
}
