import { getDb } from "@/db/client";
import { negotiate, type Locale } from "@/i18n/config";
import { masterKey } from "@/server/crypto";
import { setEnabled, verifyPause } from "@/server/reminders";
import { storedLocale } from "@/server/user-locale";

// 邮件里的一键暂停（RFC 8058 List-Unsubscribe-Post）：带签名，不需要登录。
// GET 只显示确认按钮（邮箱的安全扫描会预先打开链接，不能 GET 就生效），POST 才真正暂停。

const COPY = {
  zh: {
    title: "暂停提醒邮件",
    invalid: "链接无效或已过期。可以登录后在「邮件提醒」里修改设置。",
    ask: "暂停 Deepfy 健康档案的复查提醒邮件？之后可以随时在「邮件提醒」里重新启用。",
    button: "暂停提醒",
    failed: "暂停失败，可能账号已删除。可以登录后在「邮件提醒」里修改设置。",
    done: "已暂停提醒邮件。可以随时登录后在「邮件提醒」里重新启用。",
  },
  en: {
    title: "Pause reminder emails",
    invalid: "This link is invalid or has expired. You can sign in and change this under Reminders.",
    ask: "Pause recheck reminder emails from Deepfy Health Record? You can turn them back on any time under Reminders.",
    button: "Pause reminders",
    failed: "Couldn't pause reminders. The account may have been deleted. You can sign in and change this under Reminders.",
    done: "Reminder emails are paused. You can sign in and turn them back on any time under Reminders.",
  },
};

const page = (locale: Locale, body: string) => new Response(
  `<!doctype html><html lang="${locale === "zh" ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${COPY[locale].title}</title></head>
<body style="font-family:-apple-system,'PingFang SC',sans-serif;background:#F2F6F5;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px">
<div style="background:#fff;border-radius:18px;padding:28px;max-width:380px;text-align:center;color:#2B3B38">${body}</div></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
);

const params = (req: Request) => {
  const u = new URL(req.url);
  return { userId: u.searchParams.get("u") ?? "", sig: u.searchParams.get("s") ?? "" };
};

const browserLocale = (req: Request) => negotiate(req.headers.get("accept-language"));

export async function GET(req: Request) {
  const { userId, sig } = params(req);
  if (!verifyPause(masterKey(), userId, sig)) {
    const locale = browserLocale(req);
    return page(locale, `<p>${COPY[locale].invalid}</p>`);
  }
  const locale = (await storedLocale(getDb(), userId).catch(() => undefined)) ?? browserLocale(req);
  const c = COPY[locale];
  return page(locale, `<p style="margin:0 0 18px">${c.ask}</p>
<form method="post"><button style="border:0;border-radius:999px;background:#0F766E;color:#fff;padding:12px 24px;font-size:15px">${c.button}</button></form>`);
}

export async function POST(req: Request) {
  const { userId, sig } = params(req);
  if (!verifyPause(masterKey(), userId, sig)) return new Response("invalid", { status: 400 });
  const locale = (await storedLocale(getDb(), userId).catch(() => undefined)) ?? browserLocale(req);
  try {
    await setEnabled(getDb(), userId, false);
  } catch {
    return page(locale, `<p>${COPY[locale].failed}</p>`);
  }
  return page(locale, `<p>${COPY[locale].done}</p>`);
}
