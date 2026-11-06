import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    // 数据库测试共用 allowed_email 等全局表，测试文件不能并行
    fileParallelism: !process.env.KZ_TEST_DATABASE_URL,
  },
});
