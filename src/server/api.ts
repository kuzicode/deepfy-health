import { z } from "zod";
import { DOC_KINDS, isSafeDocKey, type RawVault } from "@/core/bundle";
import { CatalogEntrySchema, FamilySchema } from "@/core/schema";
import { getDb, type DB } from "@/db/client";
import { masterKey } from "./crypto";
import { clientIp, createLimiter } from "./login-lookup";
import { ImportRejected, NotFound, PgRepository } from "./pg-repository";
import { QuotaExceeded } from "./quota";
import { createGate } from "./throttle";
import { tokenAuth } from "./tokens";

// /api/v1 只认 Bearer token（kzh、三期 MCP）；错误响应不回显任何健康内容（SEC）

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

const perIp = createLimiter(600, 60_000);
const perUser = createLimiter(300, 60_000);
/** 导入、导出和附件传输都要把整份内容放进内存，要限制同时进行的数量（容器内存 1 GB） */
const heavyGate = createGate(2, 8);

export const rateLimited = (retryAfter = 60) =>
  Response.json({ error: "rate_limited" }, { status: 429, headers: { "cache-control": "no-store", "retry-after": String(retryAfter) } });

async function authorize(db: DB, req: Request, needSync?: boolean) {
  if (!perIp(clientIp(req))) return rateLimited();
  const auth = await tokenAuth(db, req.headers.get("authorization"));
  if (!auth) return json({ error: "unauthorized" }, 401);
  if (!perUser(auth.userId)) return rateLimited();
  if (needSync && auth.scope !== "sync") return json({ error: "sync_token_required", message: "kzh push needs a token with the local sync permission. Set it at /agents." }, 403);
  return auth;
}

/**
 * sync：整批覆盖的接口（kzh push）不留修改记录，只有「本地同步」权限的 token 能调。
 * heavy：占内存的接口，限制同时进行的数量。
 */
export async function withRepo(req: Request, fn: (repo: PgRepository, userId: string) => Promise<Response>, opts: { sync?: boolean; heavy?: boolean } = {}) {
  const db = getDb();
  const auth = await authorize(db, req, opts.sync);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  if (opts.heavy && !heavyGate.enter(userId)) return rateLimited(5);
  try {
    return await fn(new PgRepository(db, userId, masterKey()), userId);
  } catch (e) {
    return apiError(e);
  } finally {
    if (opts.heavy) heavyGate.leave(userId);
  }
}

function apiError(e: unknown) {
  if (e instanceof ImportRejected) return json({ error: "invalid", issues: e.issues }, 422);
  if (e instanceof NotFound) return json({ error: "not_found" }, 404);
  if (e instanceof QuotaExceeded) return json({ error: "quota_exceeded", resource: e.resource, limit: e.limit, message: e.message }, 403);
  if (e instanceof z.ZodError || (e instanceof Error && e.message.includes("不合法"))) return json({ error: "bad_request", message: e.message }, 400);
  console.error("api error", e instanceof Error ? e.name : "unknown");
  return json({ error: "internal" }, 500);
}

const RawDocSchema = z.object({
  kind: z.enum(DOC_KINDS),
  key: z.string().max(200),
  data: z.record(z.string(), z.unknown()),
  body: z.string().max(200_000),
  updatedAt: z.string().datetime().optional(),
}).refine((d) => isSafeDocKey(d.kind, d.key), { message: "非法的文档名", path: ["key"] });

export const RawVaultSchema: z.ZodType<RawVault> = z.object({
  family: FamilySchema,
  customCatalog: z.array(CatalogEntrySchema).max(2000).default([]),
  docs: z.record(z.string(), z.array(RawDocSchema)),
});
