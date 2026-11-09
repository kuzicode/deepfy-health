import { headers } from "next/headers";
import { isSelfHosted } from "@/server/edition";

// 官网与 App 共用一个 Next 应用：deepfy.si 由 proxy.ts 改写到 /site/[locale]；本地直接访问 /site/zh 预览

const siteHosts = () => (process.env.KZ_SITE_HOSTS ?? "deepfy.si,www.deepfy.si").split(",").map((s) => s.trim()).filter(Boolean);

/** App 的地址：生产为 https://app.deepfy.si；本地为空（同源） */
export const appUrl = (path = "/") => `${process.env.KZ_APP_URL ?? ""}${path}`;

/** 自托管没有单独的官网域名（KZ_SITE_HOSTS=site.invalid），官网页面就在实例自己的 /site 下 */
const NO_SITE_HOST = "site.invalid";

/** 官网首页：生产为 https://deepfy.si/<locale>；本地为 /site/<locale> 预览 */
export const siteUrl = (locale: string) =>
  process.env.KZ_APP_URL && siteHosts()[0] !== NO_SITE_HOST ? `https://${siteHosts()[0]}/${locale}` : `/site/${locale}`;

/** logo 指向哪里：官方版回官网，自托管版没有官网，回自己的首页 */
export const homeUrl = (locale: string) => (isSelfHosted() ? "/" : siteUrl(locale));

/** 使用文档：自托管版实例里没有官网页面，指向公开文档 */
export const docsUrl = (locale: string) => (isSelfHosted() ? `https://deepfy.si/${locale}/docs` : `${siteUrl(locale)}/docs`);

/** 官网内部链接前缀：在官网域名下为空，本地预览时为 /site */
export async function siteBase() {
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  return siteHosts().includes(host) ? "" : "/site";
}

/** 对外链接：开源仓库与 Releases（用户反馈仍走 App 内「意见反馈」，避免把健康信息贴到公开页面）；作者主页。以后加社交账号也放这里 */
export const SOCIAL = {
  github: "https://github.com/kuzicode/deepfy-health",
  releases: "https://github.com/kuzicode/deepfy-health/releases",
  author: { label: "@kuzicode", href: "https://github.com/kuzicode" },
} as const;
