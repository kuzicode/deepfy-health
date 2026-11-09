import { describe, expect, it } from "vitest";
import { runMigrationsLocked } from "./auto-migrate";

const URL = process.env.KZ_TEST_DATABASE_URL;

describe.skipIf(!URL)("带锁迁移（需要 KZ_TEST_DATABASE_URL）", () => {
  it("并发运行都成功", async () => {
    await expect(Promise.all([runMigrationsLocked(URL!), runMigrationsLocked(URL!), runMigrationsLocked(URL!)])).resolves.toBeDefined();
  });
});
