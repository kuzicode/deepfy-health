import { runMigrations } from "../db/migrate";

// 数据库测试的迁移只跑一次（各测试文件并行时同时迁移会冲突）。
// 连不上数据库时（没启动 compose.dev.yml，或沙箱禁止访问本机端口），原始错误的堆栈会让 vite 的 source map
// 处理崩成「code.charCodeAt is not a function」，看不出原因；这里改成一句明确的提示。
export default async function setup() {
  const url = process.env.KZ_TEST_DATABASE_URL;
  if (!url) return;
  try {
    await runMigrations(url);
  } catch (e) {
    const err = ((e as { cause?: unknown }).cause ?? e) as { code?: unknown; message?: unknown }; // drizzle 把连接错误包在 cause 里
    const reason = [err.code, err.message].filter((x) => typeof x === "string" && x).join(" ") || String(e);
    const hint = new Error(`测试数据库不可用（${url.replace(/\/\/[^@]*@/, "//***@")}）：${reason}。先运行 pnpm db:up（compose.dev.yml，端口 5433），或不设 KZ_TEST_DATABASE_URL 只跑单元测试（pnpm test）。`);
    hint.stack = hint.message; // 不带堆栈，避免再次触发 source map 崩溃
    throw hint;
  }
}
