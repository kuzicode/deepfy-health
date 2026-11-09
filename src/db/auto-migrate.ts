import path from "node:path";
import postgres from "postgres";
import { isSelfHosted } from "@/server/edition";
import { runMigrations } from "./migrate";

const LOCK_KEY = 7_204_118; // 任意固定值：同一个数据库里迁移一次只跑一个

/** 带锁迁移：drizzle 的迁移本身不加锁，容器重启和手动迁移同时跑会冲突。锁在专用连接上，连接断开自动释放 */
export async function runMigrationsLocked(url: string, folder = path.join(process.cwd(), "drizzle")) {
  const lock = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await lock`select pg_advisory_lock(${LOCK_KEY})`;
    await runMigrations(url, folder);
  } finally {
    await lock.end();
  }
}

/** 启动时迁移：自托管版默认开；官方版由部署脚本单独迁移，设 KZ_AUTO_MIGRATE=1 才开。失败时让进程退出，不带着旧表结构提供服务 */
export async function autoMigrate() {
  const url = process.env.DATABASE_URL;
  if (!url || !(isSelfHosted() || process.env.KZ_AUTO_MIGRATE === "1")) return;
  await runMigrationsLocked(url);
  console.info("migrations applied");
}
