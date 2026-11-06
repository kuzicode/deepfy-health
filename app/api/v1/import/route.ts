import { RawVaultSchema, json, rateLimited, withRepo } from "@/server/api";
import { createLimiter } from "@/server/login-lookup";
import { parseJsonOrUndefined, readBodyLimited } from "@/server/read-body";

// 文档数和总量由 importRaw 在事务里按账号额度检查；这里挡住过大的请求，避免解析前就占满内存
const MAX_BYTES = 20 * 1024 * 1024;
const perHour = createLimiter(60, 3600_000);

export const POST = (req: Request) =>
  withRepo(req, async (repo, userId) => {
    if (!perHour(userId)) return rateLimited();
    const text = await readBodyLimited(req, MAX_BYTES);
    if (text === null) return json({ error: "too_large" }, 413);
    const raw = RawVaultSchema.parse(parseJsonOrUndefined(text));
    const force = new URL(req.url).searchParams.get("force") === "1";
    return json(await repo.importRaw(raw, { force }));
  }, { sync: true, heavy: true });
