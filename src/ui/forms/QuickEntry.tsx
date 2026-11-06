"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, NotebookPen, X } from "lucide-react";
import { resizeImage } from "@/client/resize-image";
import type { ActionState } from "@/server/quick-entry";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

// 成员页顶部的「快速记录」：默认一行，点开后两种——症状 / 备注（可带照片）、身体数据
export function QuickEntry({ today, logAction, measureAction }: { today: string; logAction: Action; measureAction: Action }) {
  const t = useTranslations("app.quick");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"log" | "measure">("log");
  if (!open) {
    return (
      <button type="button" className="a-quick-bar" onClick={() => setOpen(true)}>
        <NotebookPen size={16} />{t("placeholder")}
      </button>
    );
  }
  return (
    <div className="a-panel a-quick">
      <div className="a-quick-head">
        <div className="a-seg" role="tablist">
          {(["log", "measure"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t(`tab.${k}`)}</button>
          ))}
        </div>
        <button type="button" className="a-icon-btn" aria-label={t("close")} onClick={() => setOpen(false)}><X size={16} /></button>
      </div>
      {tab === "log" ? <LogForm today={today} action={logAction} onDone={() => setOpen(false)} /> : <MeasureForm today={today} action={measureAction} onDone={() => setOpen(false)} />}
    </div>
  );
}

function useDone(state: ActionState, onDone: () => void) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (state.ok) onDone();
  }, [state, onDone]);
}

function ErrorLine({ state }: { state: ActionState }) {
  const t = useTranslations("app.quick");
  if (!state.error) return null;
  const known = ["invalid", "photo_size", "photo_type", "photo_count", "not_found", "generic", "quota_attachmentBytes", "quota_attachmentCount", "quota_uploadBytesPerDay", "quota_docs", "quota_docBytes", "quota_members"];
  return <p className="a-form-err">{known.includes(state.error) ? t(`errors.${state.error}` as "errors.generic") : state.error}</p>;
}

function LogForm({ today, action, onDone }: { today: string; action: Action; onDone: () => void }) {
  const t = useTranslations("app.quick");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    form.delete("photos");
    for (const p of photos) form.append("photos", p);
    return action(prev, form);
  }, {});
  useDone(state, onDone);

  const pick = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    const next = await Promise.all([...files].map((f) => resizeImage(f)));
    setPhotos((p) => [...p, ...next].slice(0, 6));
    setBusy(false);
  };

  return (
    <form action={formAction} className="a-quick-form">
      <div className="row">
        <input className="field" type="date" name="date" defaultValue={today} max={today} required />
        <input className="field narrow" type="time" name="time" aria-label={t("time")} />
        <select className="field narrow" name="type" defaultValue="symptom" aria-label={t("type")}>
          <option value="symptom">{t("symptom")}</option>
          <option value="note">{t("note")}</option>
        </select>
        <select className="field narrow" name="severity" defaultValue="" aria-label={t("severity")}>
          <option value="">{t("severityNone")}</option>
          <option value="1">{t("sev1")}</option><option value="2">{t("sev2")}</option><option value="3">{t("sev3")}</option>
        </select>
      </div>
      <input className="field" name="title" required maxLength={120} placeholder={t("titlePh")} />
      <textarea className="field area" name="body" rows={3} maxLength={5000} placeholder={t("bodyPh")} />
      <input className="field" name="tags" maxLength={200} placeholder={t("tagsPh")} />
      <div className="row photos">
        {photos.map((p, i) => (
          <span key={i} className="thumb">
            <img src={URL.createObjectURL(p)} alt="" />
            <button type="button" aria-label={t("removePhoto")} onClick={() => setPhotos((xs) => xs.filter((_, j) => j !== i))}><X size={12} /></button>
          </span>
        ))}
        {photos.length < 6 && (
          <label className="add-photo">
            <ImagePlus size={16} />{busy ? t("processing") : t("addPhoto")}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden onChange={(e) => pick(e.target.files)} />
          </label>
        )}
        <span className="hint">{t("photoHint")}</span>
      </div>
      <ErrorLine state={state} />
      <div className="row end"><button className="btn btn-primary btn-sm" disabled={pending || busy}>{pending ? t("saving") : t("save")}</button></div>
    </form>
  );
}

function MeasureForm({ today, action, onDone }: { today: string; action: Action; onDone: () => void }) {
  const t = useTranslations("app.quick");
  const [state, formAction, pending] = useActionState(action, {});
  useDone(state, onDone);
  const fields = [["WEIGHT", "kg", "0.1"], ["SBP", "mmHg", "1"], ["DBP", "mmHg", "1"], ["HR", "bpm", "1"], ["FBG", "mmol/L", "0.1"]] as const;
  return (
    <form action={formAction} className="a-quick-form">
      <div className="row"><input className="field" type="date" name="date" defaultValue={today} max={today} required /></div>
      <div className="a-measure">
        {fields.map(([code, unit, step]) => (
          <label key={code}>
            <span>{t(`m.${code}`)}</span>
            <span className="inp"><input className="field" type="number" inputMode="decimal" step={step} min="0" name={code} /><small>{unit}</small></span>
          </label>
        ))}
      </div>
      <p className="hint">{t("measureHint")}</p>
      <ErrorLine state={state} />
      <div className="row end"><button className="btn btn-primary btn-sm" disabled={pending}>{pending ? t("saving") : t("save")}</button></div>
    </form>
  );
}
