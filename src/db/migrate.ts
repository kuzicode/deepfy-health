import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

export async function runMigrations(url: string, folder = path.join(process.cwd(), "drizzle")) {
  const db = createDb(url);
  await migrate(db, { migrationsFolder: folder });
  await db.$client.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 未设置");
  await runMigrations(url);
  console.log("migrations applied");
}
