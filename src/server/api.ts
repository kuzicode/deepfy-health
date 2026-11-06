import { z } from "zod";
import { DOC_KINDS, isSafeDocKey, type RawVault } from "@/core/bundle";
import { CatalogEntrySchema, FamilySchema } from "@/core/schema";
import { getDb } from "@/db/client";
import { masterKey } from "./crypto";
import { ImportRejected, NotFound, PgRepository } from "./pg-repository";
import { QuotaExceeded } from "./quota";
import { tokenAuth } from "./tokens";

// /api/v1 只认 Bearer token（kzh、三期 MCP）；错误响应不回显任何健康内容（SEC）

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

/** write：改动数据的接口（kzh push）要求 token 权限为「可写入」 */
export async function withRepo(req: Request, fn: (repo: PgRepository, userId: string) => Promise<Response>, opts: { write?: boolean } = {}) {
  const db = getDb();
  const auth = await tokenAuth(db, req.headers.get("authorization"));
  if (!auth) return json({ error: "unauthorized" }, 401);
  if (opts.write && auth.scope !== "write") return json({ error: "read_only_token", message: "This token is read-only. Allow writes for it at /agents." }, 403);
  const userId = auth.userId;
  try {
    return await fn(new PgRepository(db, userId, masterKey()), userId);
  } catch (e) {
    return apiError(e);
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
  customCatalog: z.array(CatalogEntrySchema).default([]),
  docs: z.record(z.string(), z.array(RawDocSchema)),
});
