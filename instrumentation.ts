// 服务启动时运行一次（Next 的 instrumentation）。自托管版在这里自动迁移数据库，用户只要 docker compose up
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { autoMigrate } = await import("@/db/auto-migrate");
  await autoMigrate();
}
