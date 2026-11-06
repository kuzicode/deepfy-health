import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_HEADER, negotiate } from "@/i18n/config";

// 1) 官网域名（deepfy.si / www）：/ 按浏览器语言跳到 /zh 或 /en，/zh/* /en/* 改写到 /site/[locale]/*
// 2) /site/[locale]/*：本地预览官网，设置语言头
// 3) 其余为 App：未登录跳 /login（真正的会话校验在页面里 requireUser）

const SITE_HOSTS = (process.env.KZ_SITE_HOSTS ?? "deepfy.si,www.deepfy.si").split(",").map((s) => s.trim());
// 公开路径（鉴权在路由内自行处理）：MCP、登录、条款、API、官网预览，以及图标 / manifest / 分享图 / 品牌素材（邮件里引用 /brand/*）
const PUBLIC_APP = /^\/(mcp$|login|legal|api\/|site\/|brand\/|avatars\/|icon|apple-icon|favicon\.ico|manifest\.webmanifest|maskable-512\.png|opengraph-image)/;

function withLocale(req: NextRequest, locale: string) {
  const headers = new Headers(req.headers);
  headers.set(LOCALE_HEADER, locale);
  return headers;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = (req.headers.get("host") ?? "").split(":")[0];

  if (SITE_HOSTS.includes(host)) {
    const m = pathname.match(/^\/(zh|en)(\/.*)?$/);
    if (m) {
      const url = req.nextUrl.clone();
      url.pathname = `/site/${m[1]}${m[2] ?? ""}`;
      return NextResponse.rewrite(url, { request: { headers: withLocale(req, m[1]) } });
    }
    if (pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = `/${negotiate(req.headers.get("accept-language"))}`;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const site = pathname.match(/^\/site\/(zh|en)(\/|$)/);
  if (site) return NextResponse.next({ request: { headers: withLocale(req, site[1]) } });

  if (!process.env.DATABASE_URL || PUBLIC_APP.test(pathname) || getSessionCookie(req)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
