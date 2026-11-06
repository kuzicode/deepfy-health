"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { feedbackAction } from "./actions";

const KINDS = ["idea", "bug", "other"] as const;

/** 一个文本框 + 类型三选一；提交成功后正文清空（React 表单 action 自动重置），可以接着写下一条 */
export function FeedbackForm({ from }: { from?: string }) {
  const t = useTranslations("app.feedback");
  const [state, action, pending] = useActionState(feedbackAction, {});
  const [kind, setKind] = useState<(typeof KINDS)[number]>("idea");
  return (
    // 不用 key 强制重挂载：React 19 在 action 完成后会自动清空非受控字段；类型选择是组件状态，切换不会丢正文
    <form action={action} className="a-panel a-pad a-feedback">
      <div className="kinds" role="radiogroup">
        {KINDS.map((k) => (
          <button type="button" key={k} role="radio" aria-checked={kind === k} className={`chip${kind === k ? " chip-mint" : " chip-unknown"}`} onClick={() => setKind(k)}>{t(`kinds.${k}`)}</button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="page" value={from ?? ""} />
      <textarea className="field" name="body" required minLength={2} maxLength={2000} rows={6} placeholder={t("placeholder")} />
      <div className="row">
        <span className="muted small">{t("note")}</span>
        <button className="btn btn-primary btn-sm" disabled={pending}>{t("submit")}</button>
      </div>
      {state.ok && <p className="a-form-note ok">{t("thanks")}</p>}
      {state.error && <p className="a-form-note err">{t(`error.${state.error}`)}</p>}
    </form>
  );
}
