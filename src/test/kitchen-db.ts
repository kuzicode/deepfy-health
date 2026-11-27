import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { DB } from "@/db/client";
import * as schema from "@/db/schema";
import type { Tx } from "@/server/repo-base";

// 离线运行真实的 Drizzle 查询、事务回滚及 PgRepository。账号锁的并发语义由 Postgres 套件验证。
function createTable(sqlite: DatabaseSync, table: PgTable) {
  const { name, columns, indexes } = getTableConfig(table);
  const defs = columns.map((c) => {
    const type = c.dataType === "number" ? "integer" : "text";
    const def = c.default === undefined ? "" : " default " + (typeof c.default === "object" ? "current_timestamp" : `'${String(c.default)}'`);
    return `"${c.name}" ${type}${c.primary ? " primary key" : ""}${c.notNull ? " not null" : ""}${def}`;
  });
  sqlite.exec(`create table "${name}" (${defs.join(", ")})`);
  for (const { config } of indexes.filter((i) => i.config.unique)) {
    const cols = config.columns.map((c) => {
      if (!("name" in c)) throw new Error("Unexpected expression index in kitchen fixture");
      return `"${c.name}"`;
    });
    sqlite.exec(`create unique index "${config.name}" on "${name}" (${cols.join(", ")})`);
  }
}

// SQLite 的单行 INSERT 通过省略列使用默认值，Postgres 可以在 VALUES 中逐列写 DEFAULT。
function sqliteQuery(sql: string) {
  return sql.replace(/ for update$/, "").replace(/(insert into "[^"]+" )\(([^)]+)\) values \(([^)]+)\)/, (_, insert, names: string, values: string) => {
    const args = values.split(", ");
    const cols = names.split(", ").filter((_, i) => args[i] !== "default");
    return `${insert}(${cols.join(", ")}) values (${args.filter((p) => p !== "default").join(", ")})`;
  });
}

export function kitchenDb() {
  const sqlite = new DatabaseSync(":memory:");
  for (const t of [schema.userKey, schema.member, schema.doc, schema.attachment, schema.householdDoc,
    schema.householdAttachment, schema.agentChange, schema.apiToken, schema.household, schema.accountPlan, schema.userStatus, schema.user]) createTable(sqlite, t);
  const queries: string[] = [];
  const driver = drizzle(async (sql, params) => {
    queries.push(sql);
    if (sql.startsWith("set local lock_timeout") || sql.startsWith("select pg_advisory_xact_lock")) return { rows: [] };
    const query = sqliteQuery(sql);
    // 派生表为联接中重名的列分配独立名称，保持 SELECT 列顺序（Node 22）。
    const stmt = sqlite.prepare(query.startsWith("select ") ? `select * from (${query})` : query);
    const bindings = Object.fromEntries(params.map((p, i) => [`$${i + 1}`, p as SQLInputValue]));
    return { rows: stmt.all(bindings).map(Object.values) };
  }, { schema });
  const db = Object.assign(driver, {
    async transaction<T>(run: (tx: Tx) => Promise<T>) {
      sqlite.exec("begin");
      try {
        const result = await run(driver as unknown as Tx);
        sqlite.exec("commit");
        return result;
      } catch (e) {
        sqlite.exec("rollback");
        throw e;
      }
    },
  }) as unknown as DB;
  return { db, queries, close: () => sqlite.close() };
}
