import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // 日志照片：前端先缩到 ≤2048px JPEG（顺带去掉 EXIF / GPS），单张 ≤8MB、单次 ≤6 张；nginx client_max_body_size 30m
  experimental: {
    serverActions: { bodySizeLimit: "26mb" },
    proxyClientMaxBodySize: "26mb",
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
