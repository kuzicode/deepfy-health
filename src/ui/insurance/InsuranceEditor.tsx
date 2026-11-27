"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { POLICY_COLUMNS } from "@/core/insurance";
import { saveInsurance } from "../../../app/(app)/insurance/actions";

export function InsuranceEditor({ member, body, revision }: { member: string; body: string; revision: string }) {
  const t = useTranslations("app.insurance");
  const [status, setStatus] = useState<Awaited<ReturnType<typeof saveInsurance>>>();
  const [pending, startTransition] = useTransition();
  return <details className="insurance-editor">
    <summary>{t("edit")}</summary>
    <form key={revision} onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      startTransition(async () => { setStatus(await saveInsurance(member, revision, form)); });
    }}>
      <label>{t("body")}<textarea className="field" name="body" rows={8} defaultValue={body} /></label>
      <fieldset><legend>{t("append")}</legend>
        <div className="insurance-inputs">{POLICY_COLUMNS.map((column) => (
          <label key={column}>{t(`fields.${column}`)}
            <input className="field" name={column} placeholder={column === "term" ? t("dateHint") : undefined} />
          </label>
        ))}</div>
      </fieldset>
      <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>{t("save")}</button>
      {status && <span role="status">{t(status)}</span>}
    </form>
  </details>;
}
