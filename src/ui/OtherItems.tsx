"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { OtherItem } from "@/core/schema";
import { Flag } from "./Flag";
import { valClass } from "./format";

/**
 * 报告里字典暂未收录的项目：原样列出（不进趋势与异常判断）。
 * 底部「反馈」按钮只提交名称 / 单位 / 分组给 Deepfy 维护字典——由用户自己点，不含数值、不关联账号。
 */
export function OtherItems({ items = [], feedback }: { items?: OtherItem[]; feedback?: () => Promise<{ ok?: boolean; error?: string; count?: number }> }) {
  const t = useTranslations("app.records");
  const [state, setState] = useState<{ ok?: boolean; error?: string; count?: number }>({});
  const [pending, start] = useTransition();
  if (!items.length) return null;
  return (
    <div className="a-other">
      <div className="head"><b>{t("otherTitle")}</b><span className="muted">{t("otherHint", { count: items.length })}</span></div>
      <div className="a-rows">
        {items.map((x, i) => (
          <div key={`${x.name}-${i}`} className="a-row">
            <span className="main">
              <span className="title">{x.name}</span>
              {(x.section || x.ref_text) && <span className="detail" style={{ display: "block" }}>{[x.section, x.ref_text && t("otherRef", { ref: x.ref_text })].filter(Boolean).join(" · ")}</span>}
            </span>
            <span className="right"><span className={valClass(x.value)}>{x.value}<small>{x.unit}</small></span>{x.flag && <Flag flag={x.flag} showNormal={false} />}</span>
          </div>
        ))}
      </div>
      {feedback && (
        <div className="fb">
          <span className="muted">{state.ok ? t("feedbackDone", { count: state.count ?? 0 }) : state.error ? t("feedbackError") : t("feedbackHint")}</span>
          {!state.ok && (
            <button type="button" className="btn btn-glass btn-sm" disabled={pending} onClick={() => start(async () => setState(await feedback()))}>{t("feedbackButton")}</button>
          )}
        </div>
      )}
    </div>
  );
}
