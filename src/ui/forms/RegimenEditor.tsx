"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { RegimenItem } from "@/core/schema";
import type { ActionState } from "@/server/quick-entry";

type FormAction = (prev: ActionState, form: FormData) => Promise<ActionState>;
type Direct = () => Promise<ActionState>;
export interface MarkerOption { code: string; name: string }

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function TextField({ name, label, value, ...extra }: { name: string; label: string; value?: string; required?: boolean; maxLength?: number; placeholder?: string }) {
  return <label className="a-field"><span>{label}</span><input className="field" name={name} type="text" defaultValue={value ?? ""} {...extra} /></label>;
}

function DateField({ name, label, value, required }: { name: string; label: string; value?: string; required?: boolean }) {
  return <label className="a-field"><span>{label}</span><input className="field" name={name} type="date" defaultValue={value ?? ""} required={required} /></label>;
}

function Checks({ legend, name, options, checked = [] }: { legend: string; name: string; options: { value: string; label: string }[]; checked?: readonly string[] }) {
  return (
    <fieldset className="a-rx-days"><legend>{legend}</legend>
      {options.map((o) => <label key={o.value} className="a-rx-check"><input type="checkbox" name={name} value={o.value} defaultChecked={checked.includes(o.value)} />{o.label}</label>)}
    </fieldset>
  );
}

type Draft = Partial<RegimenItem>;
const mealValue = (v?: boolean) => (v === true ? "food" : v === false ? "fasting" : "");
// 老条目没有 source：按医生确认过与否推断，保存时不会把自购的补剂改成「医生开的」
const sourceValue = (v: Draft) => v.source ?? (v.id && !v.doctor_confirmed ? "self" : "prescribed");

function WhatFields({ v }: { v: Draft }) {
  const t = useTranslations("app.regimen");
  const f = useTranslations("app.regimen.form");
  const source = sourceValue(v);
  return (
    <div className="grid">
      <label className="a-field"><span>{f("kind")}</span>
        <select className="field" name="kind" defaultValue={v.kind ?? "medication"}>
          <option value="medication">{t("medication")}</option>
          <option value="supplement">{t("supplement")}</option>
        </select>
      </label>
      <TextField name="name" label={f("name")} value={v.name} required maxLength={80} />
      <TextField name="dose" label={f("dose")} value={v.dose} required maxLength={60} placeholder={f("dosePh")} />
      <label className="a-field"><span>{f("source")}</span>
        <select className="field" name="source" defaultValue={source}>
          <option value="prescribed">{f("prescribed")}</option>
          <option value="self">{f("self")}</option>
          {source === "agent" && <option value="agent">{f("agent")}</option>}
        </select>
      </label>
    </div>
  );
}

function WhenFields({ v }: { v: Draft }) {
  const t = useTranslations("app.regimen");
  const f = useTranslations("app.regimen.form");
  return (
    <>
      <div className="grid">
        <TextField name="times" label={f("times")} value={v.times?.join(", ")} placeholder={f("timesPh")} />
        <TextField name="frequency" label={f("frequency")} value={v.frequency} maxLength={60} placeholder={f("frequencyPh")} />
        <label className="a-field"><span>{f("meal")}</span>
          <select className="field" name="meal" defaultValue={mealValue(v.with_food)}>
            <option value="">{f("mealAny")}</option>
            <option value="food">{t("withFood")}</option>
            <option value="fasting">{t("fasting")}</option>
          </select>
        </label>
        <label className="a-rx-check"><input type="checkbox" name="as_needed" defaultChecked={v.as_needed} />{f("asNeeded")}</label>
      </div>
      <Checks legend={f("days")} name="days" options={WEEK.map((d) => ({ value: d, label: t(`days.${d}`) }))} checked={v.days} />
    </>
  );
}

function DetailFields({ v, today, markers }: { v: Draft; today: string; markers: MarkerOption[] }) {
  const f = useTranslations("app.regimen.form");
  return (
    <>
      <div className="grid">
        <DateField name="start" label={f("start")} value={v.start ?? today} required />
        <DateField name="end" label={f("end")} value={v.end} />
        <DateField name="expiry" label={f("expiry")} value={v.expiry} />
        <TextField name="prescriber" label={f("prescriber")} value={v.prescriber} maxLength={100} />
        <TextField name="brand" label={f("brand")} value={v.brand} maxLength={80} />
        <TextField name="spec" label={f("spec")} value={v.spec} maxLength={120} placeholder={f("specPh")} />
      </div>
      <TextField name="reason" label={f("reason")} value={v.reason} maxLength={200} />
      <label className="a-field"><span>{f("precautions")}</span><textarea className="field area" name="precautions" rows={3} defaultValue={v.precautions?.join("\n") ?? ""} /></label>
      {markers.length > 0 && <Checks legend={f("related")} name="related" options={markers.map((m) => ({ value: m.code, label: m.name }))} checked={v.related} />}
    </>
  );
}

/** 表单提交成功后关闭 */
function useClosingAction(action: FormAction, onClose: () => void) {
  const result = useActionState(action, {});
  const [state] = result;
  useEffect(() => { if (state.ok) onClose(); }, [state, onClose]);
  return result;
}

function FormFooter({ submit, error, pending, onClose }: { submit: string; error?: string; pending: boolean; onClose: () => void }) {
  const t = useTranslations("app.regimen");
  return (
    <>
      {error && <p className="a-form-err">{t("saveError")}</p>}
      <div className="row end">
        <button type="button" className="btn btn-glass btn-sm" onClick={onClose}>{t("cancel")}</button>
        <button className="btn btn-primary btn-sm" disabled={pending}>{submit}</button>
      </div>
    </>
  );
}

// 用药页的新增 / 编辑表单。表单没有的字段（agent 记的依据、状态等）保存时原样保留。
function RegimenForm({ item, today, markers, action, onClose }: { item?: RegimenItem; today: string; markers: MarkerOption[]; action: FormAction; onClose: () => void }) {
  const t = useTranslations("app.regimen");
  const [state, submit, pending] = useClosingAction(action, onClose);
  const v: Draft = item ?? {};
  return (
    <form action={submit} className="a-panel a-pad a-profile-form a-rx-form">
      <WhatFields v={v} />
      <WhenFields v={v} />
      <DetailFields v={v} today={today} markers={markers} />
      <FormFooter submit={t("save")} error={state.error} pending={pending} onClose={onClose} />
    </form>
  );
}

export function AddRegimen({ today, markers, action }: { today: string; markers: MarkerOption[]; action: FormAction }) {
  const t = useTranslations("app.regimen");
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn btn-glass btn-sm" onClick={() => setOpen(true)}><Plus size={14} />{t("add")}</button>;
  return <div className="a-rx-add"><RegimenForm today={today} markers={markers} action={action} onClose={() => setOpen(false)} /></div>;
}

function StopForm({ today, action, onClose }: { today: string; action: FormAction; onClose: () => void }) {
  const t = useTranslations("app.regimen");
  const f = useTranslations("app.regimen.form");
  const [state, submit, pending] = useClosingAction(action, onClose);
  return (
    <form action={submit} className="a-rx-stop">
      <label className="a-field"><span>{f("stopOn")}</span><input className="field" type="date" name="stopped_on" defaultValue={today} required /></label>
      <label className="a-field"><span>{f("stopReason")}</span><input className="field" name="stop_reason" maxLength={200} /></label>
      <FormFooter submit={t("stop")} error={state.error} pending={pending} onClose={onClose} />
    </form>
  );
}

/** 采纳带结束日期的建议：开始日期会变成今天，所以结束日期要重新确认；已过的日期不预填 */
function AdoptForm({ end, today, action, onClose }: { end: string; today: string; action: FormAction; onClose: () => void }) {
  const t = useTranslations("app.regimen");
  const f = useTranslations("app.regimen.form");
  const [state, submit, pending] = useClosingAction(action, onClose);
  const passed = end < today;
  return (
    <form action={submit} className="a-rx-stop">
      <label className="a-field"><span>{f("adoptEnd")}</span><input className="field" type="date" name="end" defaultValue={passed ? "" : end} min={today} /></label>
      {passed && <p className="muted a-rx-hint">{f("adoptEndPassed", { date: end })}</p>}
      <FormFooter submit={t("adopt")} error={state.error} pending={pending} onClose={onClose} />
    </form>
  );
}

function useRun() {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const run = (fn: Direct) => start(async () => { const r = await fn(); setFailed(!!r.error); });
  return { pending, failed, run };
}

/** 建议中：开始吃 / 不用了。有结束日期的先确认，没有的一点就采纳 */
function SuggestionActions({ item, today, adopt, remove }: { item: RegimenItem; today: string; adopt: FormAction; remove: Direct }) {
  const t = useTranslations("app.regimen");
  const [confirming, setConfirming] = useState(false);
  const { pending, failed, run } = useRun();
  if (confirming && item.end) return <AdoptForm end={item.end} today={today} action={adopt} onClose={() => setConfirming(false)} />;
  return (
    <div className="a-rx-actions">
      <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => (item.end ? setConfirming(true) : run(() => adopt({}, new FormData())))}>{t("adopt")}</button>
      <button type="button" className="btn btn-glass btn-sm" disabled={pending} onClick={() => run(remove)}>{t("dismiss")}</button>
      {failed && <span className="a-form-note err">{t("saveError")}</span>}
    </div>
  );
}

/** 每条的操作。在用：编辑 / 停用 / 删除；已停用：编辑 / 删除。删除要点两次 */
export function RegimenItemActions({ item, status, today, markers, save, stop, adopt, remove }: {
  item: RegimenItem; status: "active" | "suggested" | "stopped"; today: string; markers: MarkerOption[];
  save: FormAction; stop: FormAction; adopt: FormAction; remove: Direct;
}) {
  const t = useTranslations("app.regimen");
  const [mode, setMode] = useState<"edit" | "stop" | null>(null);
  const [armed, setArmed] = useState(false);
  const { pending, failed, run } = useRun();
  const close = () => setMode(null);
  if (status === "suggested") return <SuggestionActions item={item} today={today} adopt={adopt} remove={remove} />;
  if (mode === "edit") return <RegimenForm item={item} today={today} markers={markers} action={save} onClose={close} />;
  if (mode === "stop") return <StopForm today={today} action={stop} onClose={close} />;
  return (
    <div className="a-rx-actions">
      <button type="button" className="btn btn-glass btn-sm" onClick={() => setMode("edit")}>{t("edit")}</button>
      {status === "active" && <button type="button" className="btn btn-glass btn-sm" onClick={() => setMode("stop")}>{t("stop")}</button>}
      {armed
        ? <button type="button" className="btn btn-glass btn-sm a-rx-danger" disabled={pending} onClick={() => run(remove)}>{t("confirmRemove")}</button>
        : <button type="button" className="btn btn-glass btn-sm" onClick={() => setArmed(true)}>{t("remove")}</button>}
      {failed && <span className="a-form-note err">{t("saveError")}</span>}
    </div>
  );
}
