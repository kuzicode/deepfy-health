import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// 开发模式的热更新要用 eval 和 WebSocket，只在生产构建里加。Next 的页面有内联脚本，所以 script-src 要 unsafe-inline。
// HSTS、nosniff、Referrer-Policy 由反向代理设置（docs/self-hosting.md），这里重复设会出现两个同名响应头
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  headers: async () => (process.env.NODE_ENV === "production" ? [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: CSP }] }] : []),
  // 日志照片：前端先缩到 ≤2048px JPEG（顺带去掉 EXIF / GPS），单张 ≤8MB、单次 ≤6 张；nginx client_max_body_size 30m
  experimental: {
    serverActions: { bodySizeLimit: "26mb" },
    proxyClientMaxBodySize: "26mb",
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
