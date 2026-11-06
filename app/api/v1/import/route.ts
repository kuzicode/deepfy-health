import { RawVaultSchema, json, rateLimited, withRepo } from "@/server/api";
import { createLimiter } from "@/server/login-lookup";

// 文档数和总量由 importRaw 在事务里按账号额度检查；这里挡住过大的请求，避免解析前就占满内存
const MAX_BYTES = 20 * 1024 * 1024;
const perHour = createLimiter(60, 3600_000);

export const POST = (req: Request) =>
  withRepo(req, async (repo, userId) => {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return json({ error: "too_large" }, 413);
    if (!perHour(userId)) return rateLimited();
    const raw = RawVaultSchema.parse(await req.json());
    const force = new URL(req.url).searchParams.get("force") === "1";
    return json(await repo.importRaw(raw, { force }));
  }, { sync: true, heavy: true });
