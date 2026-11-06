import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = ReturnType<typeof createDb>;

export function createDb(url: string) {
  return drizzle(postgres(url, { max: 10 }), { schema });
}

let shared: DB | undefined;

export function getDb(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 未设置");
  shared ??= createDb(url);
  return shared;
}

export const cloudMode = () => !!process.env.DATABASE_URL;
