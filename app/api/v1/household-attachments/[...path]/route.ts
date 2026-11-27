import { json, withRepo } from "@/server/api";

// 必须小于 next.config.ts 的 proxyClientMaxBodySize（26 MB）：超过它的请求体会被截断，不会报错
const MAX = 25 * 1024 * 1024;
type Ctx = { params: Promise<{ path: string[] }> };

export const PUT = (req: Request, { params }: Ctx) =>
  withRepo(req, async (repo) => {
    if (Number(req.headers.get("content-length") ?? 0) > MAX) return json({ error: "too_large" }, 413);
    const { path } = await params;
    const data = Buffer.from(await req.arrayBuffer());
    if (data.length > MAX) return json({ error: "too_large" }, 413);
    const mime = req.headers.get("content-type") ?? "application/octet-stream";
    return json(await repo.putHouseholdAttachment(path.join("/"), data, mime));
  }, { sync: true, heavy: true });

export const GET = (req: Request, { params }: Ctx) =>
  withRepo(req, async (repo) => {
    const { path } = await params;
    const { data, mime } = await repo.getHouseholdAttachment(path.join("/"));
    return new Response(new Uint8Array(data), { headers: { "content-type": mime, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }, { heavy: true });
