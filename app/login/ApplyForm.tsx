"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";

// 抢先体验申请：填邮箱即可提交，可选填在用的 agent 和一句话用途。已开通的邮箱由服务端返回 next，转去登录。

const AGENTS = ["claude-code", "codex", "gemini-cli", "grokbot", "workbuddy", "hermes-agent", "other"] as const;

export function ApplyForm({ email, setEmail, onDone, onError }: {
  email: string;
  setEmail: (v: string) => void;
  onDone: (next: string) => void;
  onError: (code: string) => void;
}) {
  const t = useTranslations("login.apply");
  const locale = useLocale();
  const [agents, setAgents] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (a: string) => setAgents((v) => (v.includes(a) ? v.filter((x) => x !== a) : [...v, a]));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, agents, note: note.trim() || undefined, locale, source: "login" }),
    }).catch(() => undefined);
    setBusy(false);
    const body = ((await res?.json().catch(() => ({}))) ?? {}) as { next?: string; error?: string };
    if (res?.ok) onDone(body.next ?? "closed");
    else onError(body.error ?? "network");
  };

  return (
    <form className="l-form" onSubmit={submit}>
      <input className="l-input" type="email" required autoComplete="email" placeholder={t("email")} value={email} readOnly={busy} onChange={(e) => setEmail(e.target.value.trim())} />
      <fieldset className="l-chips">
        <legend>{t("agents")}</legend>
        {AGENTS.map((a) => (
          <button type="button" key={a} className={agents.includes(a) ? "on" : ""} aria-pressed={agents.includes(a)} onClick={() => toggle(a)}>
            {agents.includes(a) && <Check size={13} />}{t(`agent.${a}`)}
          </button>
        ))}
      </fieldset>
      <textarea className="l-note" rows={2} maxLength={200} placeholder={t("note")} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="l-btn" disabled={busy || !/^\S+@\S+\.\S+$/.test(email)}>{t("submit")}</button>
    </form>
  );
}
