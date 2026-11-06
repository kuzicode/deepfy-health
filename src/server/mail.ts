// 发信：Resend HTTP API（不引 SDK）。未配置 RESEND_API_KEY 时：本地开发打印到控制台；生产环境报错，除非设了 KZ_MAIL_CONSOLE=1。
import { cnDateTime } from "./cn-time";
import type { Locale } from "@/i18n/config";
import { countMail } from "./ops";
import type { Digest } from "./feedback";

type OtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

const BRAND: Record<Locale, string> = { zh: "Deepfy 健康档案", en: "Deepfy Health Record" };

const SUBJECT: Record<Locale, Record<OtpType, string>> = {
  zh: {
    "email-verification": "验证你的邮箱",
    "sign-in": "登录验证码",
    "forget-password": "设置 / 重置密码验证码",
    "change-email": "更换邮箱验证码",
  },
  en: {
    "email-verification": "Verify your email",
    "sign-in": "Your sign-in code",
    "forget-password": "Set or reset your password",
    "change-email": "Change your email",
  },
};

/** 面向用户的邮件文案；每周汇总只发管理员，保持中文 */
const COPY = {
  zh: {
    system: "这是一封系统邮件，请勿直接回复。",
    tagline: "你的健康档案，Agent 也读得懂。",
    otp: {
      preheader: (c: string) => `验证码 ${c}，5 分钟内有效`,
      intro: "你的验证码是：",
      valid: "5 分钟内有效。如果不是你本人操作，请忽略这封邮件，你的账号不会有任何变化。",
      subject: (c: string, title: string) => `${c} 是你的 ${BRAND.zh}${title}`,
      text: (c: string, title: string) => `${BRAND.zh} · ${title}\n\n你的验证码是 ${c}，5 分钟内有效。如果不是你本人操作，请忽略这封邮件。`,
    },
    reminder: {
      title: "接下来要做的检查",
      subject: (n: number) => `${n} 项检查即将到期 · ${BRAND.zh}`,
      separator: "；",
      empty: "目前没有到提醒时间的项目。",
      open: "打开档案",
      pause: (settings: string, oneClick: string) => `不想再收到？<a href="${settings}" style="color:#0F766E">在提醒设置里暂停或修改</a>，或<a href="${oneClick}" style="color:#7C8D89">一键暂停</a>。`,
      line: (x: ReminderLine) => `${x.who}：${x.what} — ${x.when}`,
      textOpen: "打开档案",
      textPause: "暂停提醒",
    },
    reminderCode: {
      title: "验证提醒收件邮箱",
      subject: (c: string) => `${c} 是你的 ${BRAND.zh}提醒邮箱验证码`,
      text: (c: string) => `${BRAND.zh}\n\n验证码 ${c}，用于把这个邮箱设为复查提醒的收件邮箱，5 分钟内有效。不是你本人操作请忽略。`,
    },
  },
  en: {
    system: "This is an automated email. Please don't reply.",
    tagline: "Your health record, readable by your agents.",
    otp: {
      preheader: (c: string) => `Code ${c}, valid for 5 minutes`,
      intro: "Your code is:",
      valid: "It's valid for 5 minutes. If this wasn't you, ignore this email and nothing will change on your account.",
      subject: (c: string) => `${c} is your ${BRAND.en} code`,
      text: (c: string, title: string) => `${BRAND.en} · ${title}\n\nYour code is ${c}. It's valid for 5 minutes. If this wasn't you, ignore this email.`,
    },
    reminder: {
      title: "Coming up",
      subject: (n: number) => `${n} ${n === 1 ? "check" : "checks"} coming up · ${BRAND.en}`,
      separator: "; ",
      empty: "Nothing is due for a reminder right now.",
      open: "Open your record",
      pause: (settings: string, oneClick: string) => `Don't want these? <a href="${settings}" style="color:#0F766E">Pause or change them in reminder settings</a>, or <a href="${oneClick}" style="color:#7C8D89">pause with one click</a>.`,
      line: (x: ReminderLine) => `${x.who}: ${x.what} — ${x.when}`,
      textOpen: "Open your record",
      textPause: "Pause reminders",
    },
    reminderCode: {
      title: "Confirm your reminder email",
      subject: (c: string) => `${c} is your ${BRAND.en} reminder email code`,
      text: (c: string) => `${BRAND.en}\n\nUse code ${c} to send recheck reminders to this address. It's valid for 5 minutes. If this wasn't you, ignore this email.`,
    },
  },
};

const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif";
const MONO = "'IBM Plex Mono',ui-monospace,Menlo,monospace";
export const appBase = () => process.env.KZ_APP_URL || process.env.BETTER_AUTH_URL || "https://app.deepfy.si";

// 邮件外壳：与网站同一套品牌（影像环 logo、主色 #0F766E、薄荷浅底），表格布局 + 行内样式以兼容各邮箱客户端。
// logo 用 PNG（多数邮箱不显示 SVG），从 KZ_APP_URL/brand/ 加载；图片被拦截时有 alt 文字兜底。
function layout({ title, preheader, body, base, locale = "zh" }: { title: string; preheader: string; body: string; base: string; locale?: Locale }) {
  const c = COPY[locale];
  return `<!doctype html><html lang="${locale === "zh" ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#F2F6F5">
<div style="display:none;max-height:0;overflow:hidden">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F6F5;padding:32px 16px;font-family:${FONT}">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
    <tr><td style="padding:0 4px 20px"><img src="${base}/brand/deepfy-horizontal.png" width="112" height="41" alt="Deepfy" style="display:block;border:0;width:112px;height:auto"></td></tr>
    <tr><td style="background:#FFFFFF;border:1px solid rgba(13,48,42,0.09);border-radius:20px;padding:32px 32px 28px">
      <p style="margin:0 0 6px;font:500 11px/1.4 ${MONO};letter-spacing:0.08em;text-transform:uppercase;color:#0F766E">${BRAND[locale]}</p>
      <h1 style="margin:0 0 20px;font:600 22px/1.35 ${FONT};color:#0B1F1C">${title}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:20px 4px 0;font:400 12px/1.7 ${FONT};color:#7C8D89">
      ${c.system}<br>
      <a href="${base}" style="color:#0F766E;text-decoration:none">app.deepfy.si</a> · ${c.tagline}
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

const p = (text: string, muted = false) =>
  `<p style="margin:0 0 ${muted ? 0 : 12}px;font:400 ${muted ? 13 : 15}px/1.6 ${FONT};color:${muted ? "#7C8D89" : "#2B3B38"}">${text}</p>`;

function otpHtml(otp: string, title: string, locale: Locale, base = appBase()) {
  const c = COPY[locale].otp;
  return layout({
    base, locale, title,
    preheader: c.preheader(otp),
    body: `${p(c.intro)}
      <div style="margin:0 0 20px;padding:18px 0;border-radius:14px;background:#E6FAF6;text-align:center;font:600 32px/1 ${MONO};letter-spacing:10px;color:#0F766E">${otp}</div>
      ${p(c.valid)}`,
  });
}

/** 发件地址来自 MAIL_FROM（可能带显示名），显示名按语言走 */
function fromHeader(locale: Locale) {
  const raw = process.env.MAIL_FROM ?? "no-reply@deepfy.si";
  const address = raw.match(/<([^>]+)>/)?.[1] ?? raw.trim();
  return `${BRAND[locale]} <${address}>`;
}

async function send({ to, subject, html, text, devLog, headers, locale = "zh" }: { to: string; subject: string; html: string; text: string; devLog: string; headers?: Record<string, string>; locale?: Locale }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // 自托管可以不接发信服务：显式设 KZ_MAIL_CONSOLE=1 后，验证码打印到自己服务器的日志（devLog 不含健康内容）
    if (process.env.NODE_ENV === "production" && process.env.KZ_MAIL_CONSOLE !== "1") throw new Error("RESEND_API_KEY 未设置，无法发信（自托管见 docs/self-hosting.md）");
    console.info(`[mail] ${devLog}`);
    return true;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: fromHeader(locale), to: [to], subject, html, text, ...(headers ? { headers } : {}) }),
  });
  if (!res.ok) console.error("mail send failed", res.status);
  else void countMail().catch(() => {}); // 每日发信计数（每周汇总里报给管理员）
  return res.ok;
}

export function otpMail(otp: string, type: OtpType, locale: Locale = "zh") {
  const title = SUBJECT[locale][type];
  const c = COPY[locale].otp;
  return { subject: c.subject(otp, title), html: otpHtml(otp, title, locale), text: c.text(otp, title) };
}

export const sendOtpEmail = (email: string, otp: string, type: OtpType, locale: Locale = "zh") => send({
  to: email, locale, ...otpMail(otp, type, locale),
  devLog: `${SUBJECT[locale][type]} → ${email}：${otp}`,
});

// ---- 复查 / 体检提醒（只写成员称呼、日期、项目名，不写数值与分析） ----

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface ReminderLine { who: string; what: string; when: string }

export function reminderHtml(items: ReminderLine[], pauseUrl: string, locale: Locale = "zh", base = appBase()) {
  const c = COPY[locale].reminder;
  const rows = items.map((x) => `<tr><td style="padding:12px 0;border-top:1px solid rgba(13,48,42,0.08)">
      <div style="font:500 12px/1.4 ${FONT};color:#7C8D89">${esc(x.who)}</div>
      <div style="font:500 15px/1.5 ${FONT};color:#0B1F1C">${esc(x.what)}</div>
      <div style="font:400 13px/1.4 ${MONO};color:#0F766E">${esc(x.when)}</div>
    </td></tr>`).join("");
  return layout({
    base, locale,
    title: c.title,
    preheader: esc(items.map((x) => `${x.who} ${x.what}`).join(c.separator).slice(0, 120)),
    body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${rows || `<tr><td>${p(c.empty, true)}</td></tr>`}</table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td style="border-radius:999px;background:#0F766E">
        <a href="${base}" style="display:inline-block;padding:12px 24px;font:600 14px/1 ${FONT};color:#FFFFFF;text-decoration:none">${c.open}</a>
      </td></tr></table>
      ${p(c.pause(`${base}/reminders`, pauseUrl), true)}`,
  });
}

export async function sendReminderEmail(to: string, items: ReminderLine[], pauseUrl: string, locale: Locale = "zh") {
  const c = COPY[locale].reminder;
  const colon = locale === "zh" ? "：" : ": ";
  const text = [`${BRAND[locale]} · ${c.title}`, "", ...items.map(c.line), "", `${c.textOpen}${colon}${appBase()}`, `${c.textPause}${colon}${appBase()}/reminders`].join("\n");
  const ok = await send({
    to, locale,
    subject: c.subject(items.length),
    html: reminderHtml(items, pauseUrl, locale),
    text,
    devLog: `提醒邮件 → ${to}：${items.length} 项`,
    headers: { "List-Unsubscribe": `<${pauseUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  if (!ok) throw new Error("reminder mail failed");
}

export async function sendReminderCode(to: string, code: string, locale: Locale = "zh") {
  const c = COPY[locale].reminderCode;
  const ok = await send({
    to, locale,
    subject: c.subject(code),
    html: otpHtml(code, c.title, locale),
    text: c.text(code),
    devLog: `提醒邮箱验证码 → ${to}：${code}`,
  });
  if (!ok) throw new Error("mail failed");
}

// ---- 每周汇总（发给 KZ_ADMIN_EMAILS）：用户反馈 + 字典缺口变化 + 几项运营数字 ----

const KIND_LABEL: Record<string, string> = { idea: "建议", bug: "问题", other: "其他" };

export function digestHtml(d: Digest, base = appBase()) {
  const fb = d.feedback.map((f) => `<tr><td style="padding:12px 0;border-top:1px solid rgba(13,48,42,0.08)">
      <div style="font:500 12px/1.4 ${MONO};color:#7C8D89">${esc(KIND_LABEL[f.kind] ?? f.kind)} · ${esc(f.email ?? "—")} · ${cnDateTime(f.createdAt)}${f.page ? ` · ${esc(f.page)}` : ""}</div>
      <div style="font:400 14.5px/1.6 ${FONT};color:#0B1F1C;white-space:pre-wrap">${esc(f.body)}</div>
    </td></tr>`).join("");
  const gaps = d.gaps.map((g) => `<tr><td style="padding:7px 0;border-top:1px solid rgba(13,48,42,0.08);font:400 14px/1.4 ${FONT};color:#0B1F1C">${esc(g.name)}<span style="color:#7C8D89">${[g.section, g.unit].filter(Boolean).map((x) => ` · ${esc(x!)}`).join("")}</span></td>
      <td align="right" style="padding:7px 0;border-top:1px solid rgba(13,48,42,0.08);font:500 13px/1.4 ${MONO};color:#0F766E;white-space:nowrap">${g.isNew ? "新 " : ""}+${g.added} / ${g.count}</td></tr>`).join("");
  const s = d.stats;
  const r = d.resources;
  const mb = (b: number) => `${(b / 1048576).toFixed(b < 10 * 1048576 ? 1 : 0)} MB`;
  const resLine = `资源：近 7 天发信 ${r.mailWeek} 封（单日最高 ${r.mailPeakDay}，本月 ${r.mailMonth} / 3000），附件共 ${mb(r.attachmentBytes)}${r.diskUsedPct === undefined ? "" : `，磁盘已用 ${r.diskUsedPct}%`}。${r.alert ? '<b style="color:#B42318">需要注意：磁盘用到 70%，或发信接近 Resend 免费档上限（每天 100 / 每月 3000）。</b>' : ""}`;
  return layout({
    base,
    title: "本周汇总",
    preheader: `${d.feedback.length} 条反馈，${d.gaps.length} 个字典缺口变化`,
    body: `${p(`${d.since ? `自 ${cnDateTime(d.since)} 以来` : "首次汇总"}：<b>${d.feedback.length}</b> 条用户反馈，<b>${d.gaps.length}</b> 个字典缺口新增或次数增加。账号共 ${s.users} 个（新增 ${s.newUsers}）。`)}
      ${p(resLine, !r.alert)}
      ${fb ? `<h2 style="margin:22px 0 4px;font:600 16px/1.4 ${FONT};color:#0B1F1C">用户反馈</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${fb}</table>` : ""}
      ${gaps ? `<h2 style="margin:22px 0 4px;font:600 16px/1.4 ${FONT};color:#0B1F1C">字典缺口（本周新增 / 累计）</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${gaps}</table>` : ""}
      <p style="margin:22px 0 0"><a href="${base}/admin" style="color:#0F766E">在管理后台查看全部 →</a></p>`,
  });
}

export async function sendDigestEmail(to: string[], d: Digest) {
  const text = [
    `${BRAND.zh} · 本周汇总`, "",
    ...d.feedback.map((f) => `[${KIND_LABEL[f.kind] ?? f.kind}] ${f.email ?? "—"} ${cnDateTime(f.createdAt)}${f.page ? ` ${f.page}` : ""}\n${f.body}\n`),
    `资源：近 7 天发信 ${d.resources.mailWeek} 封（单日最高 ${d.resources.mailPeakDay}，本月 ${d.resources.mailMonth} / 3000），附件 ${Math.round(d.resources.attachmentBytes / 1048576)} MB${d.resources.diskUsedPct === undefined ? "" : `，磁盘 ${d.resources.diskUsedPct}%`}${d.resources.alert ? "（需要注意）" : ""}`, "",
    ...(d.gaps.length ? ["字典缺口（本周新增 / 累计）", ...d.gaps.map((g) => `- ${g.name}${g.unit ? ` (${g.unit})` : ""}  +${g.added} / ${g.count}`)] : []),
    "", `${appBase()}/admin`,
  ].join("\n");
  for (const addr of to) {
    const ok = await send({ to: addr, subject: `每周汇总：${d.feedback.length} 条反馈 · ${BRAND.zh}`, html: digestHtml(d), text, devLog: `每周汇总 → ${addr}：${d.feedback.length} 条反馈，${d.gaps.length} 个缺口` });
    if (!ok) throw new Error("digest mail failed");
  }
}
